# CLAUDE.md — MappAI Swiss Edition
> Documento di briefing per Claude Code.
> Autore: Giacomo Meschini — giacomo@insegnai.ch
> Ultimo aggiornamento: 10 giugno 2026 (fix Phase 1 DEFINITIVO: maxItems:7 su schemaL1 — causa reale del troncamento -12tok;
> valutazione Apertus/Mistral archiviata in `docs/model-evaluation/` — focus generazione ora su **Google Gemini**)

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
    - Moduli UMD testati in Node (jigsaw, palace, games): usare `_tSafe(k, f)` locale,
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
    - Dungeon: prompt quiz/tutor/NPC condizionali via `_dgEn()` (segue `getMapLanguage`,
      'auto' → italiano). Narrativa di gioco e Studio Attivo via `_tSafe`/`t()`.
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

---

## 11. SESSIONE DI SVILUPPO CORRENTE — PRIORITÀ

### ✅ FATTO (20/7/26): 011-pipeline-materiali — pipeline «Genera materiali» (spec-kit completo)
Branch `011-pipeline-materiali` (NON ancora mergiato). Spec-kit completo
(`specs/011-pipeline-materiali/`), 43 task, 8 commit puliti. Suite **621/621** ✅.
Bottone **«Genera materiali»** in Costruisci → modale → pipeline crash-safe a 4 step
(A mappa → B quiz/flashcard → C fogli nodi → D sintesi+voce) che orchestra i motori
ESISTENTI e archivia tutto nel vault dentro cartelle di classe `[sede]-[classe]`.
- **Core puri**: `mappai-pipeline-core.js` (UMD: manifest `mappai-pipeline@1` + macchina a
  stati, validatori step, `estimateCalls`, `buildFileName`, preset) — 21 test; estensioni a
  `files-core` (`mapClassFolder`/`vaultFolderName`/`sanitizeVaultRelPath`/`VAULT_CONTAINER_EXCLUDE`)
  e `teach-core` (`matchesSelectedProject`). `usage-core`: categoria `pipeline` (7 sottovoci).
- **Motori resi headless** (una funzione, due consumer — flusso manuale INVARIATO):
  `buildQuizSetHtml`/`buildFlashcardSetHtml` (quiz-print), `printAllNodeLabels(opts)` con
  `toDisk`→base64 (print-dossier), `window.MappAISynthesis {runWholeMap silent, buildHtml,
  generateAudio}` (branch-synthesis), `window.buildVaultMapData()` (vault-io).
- **IPC sottili** (main = solo I/O/finestre): `html-to-pdf` (finestra offscreen +
  `printToPDF`), `save-vault-file` (sanitizz. da FilesCore), `vault-materials-list`,
  `pipeline-open-folder`/`pipeline-open-file`; `get-all-vaults` esteso a **2 livelli**
  (contenitori classe, shape invariata + `classDir`); `files-root-get` espone `mapsBaseDir`;
  `sharedmat-add` accetta `mapName`.
- **Orchestratore** `mappai-material-pipeline.js` (`window.MappAIPipeline`): modale config
  (classe · quiz/fogli/sintesi · VERDE · adatta-livello · preset), pre-flight+stima live,
  step A-D con manifest **file-first** (scritto a ogni transizione), riepilogo + **Riprova**
  per step, **ripresa idempotente** (`checkResume` al load del vault → prompt → salta i done),
  degrado voce non bloccante (FR-006).
- **Insegna (US5)**: click riga «Progetti» = **seleziona** la mappa (evidenzia, 2° click
  deseleziona); le 3 sezioni si filtrano; Materiali fonde archivio + file su disco. «Riprendi»
  apre. Preset in `localStorage mappai_material_presets` (mai la classe). Sede sulla classe:
  tendina da `MappAITeacherProfile.sediList()` nei DUE form.
- **Kill-switch**: `mappai_teach_row_select='0'` → click riga Insegna apre (comportamento storico).
- **Limite noto**: `open-vault-folder`/`zip-vault-to-materials` (flussi condivisione) risolvono
  ancora il vault flat per basename → non trovano i vault ANNIDATI. La pipeline usa path
  assoluti (`pipeline-open-folder/-file`) → non impattata. Follow-up se serve la condivisione
  QR dei vault di classe.
- ⚠️ **Da testare in Electron vivo** (quickstart Fase 1-3): builder da console + htmlToPdf,
  pipeline reale su una fonte (4 step done su disco), crash a metà + ripresa (zero chiamate
  ripetute), riprova step, degrado voce, collisione ` · 02`, preset, sede, selezione Insegna +
  materiali da disco, consumi categoria «Pipeline materiali». Poi merge in main.

### 🔵 IN CORSO (18-19/7/26): branch `chore/electron-39` — Electron 39 + fix quiz + reveal risultati
Branch NON ancora mergiato in main. Suite **493/493**. Cinque commit puliti:
- `9975308` **Electron 30 → 39.8.10** (chiude 16 alert Dependabot). Codice già pronto:
  preload usa `webUtils.getPathForFile`; unico adeguamento handler `console-message`
  (firma a oggetto evento). `npm run pack` firma con electron-builder 24 senza problemi.
- `a55c679` **emoji Noto** su collab/tutor student.html (il webfont Noto non era caricato
  → iPhone cadeva su Apple). + griglia login individuale collab rifatta (chip 60×60).
- `b455855` **naming progressivo sessioni** (Live/Tutor/Lavagna): cartelle `…-00`, `…-01`
  per somministrazione → risolve il bug "Sessione chiusa" al 2° avvio stesso giorno/classe.
  Crash-safe: riprende l'ultima solo se ancora aperta. `progressiveSessionDir` in main.js,
  `sessionSeq` puro in files-core, `phase`/`markClosed` in collab-server.
- `d3719c0` **credenziali classe casuali** (Fisher-Yates, segretezza account) — di un'altra
  sessione, estratto pulito dal working tree entangled.
- `ac8bb34` **quiz: qualità + varietà + feedback risultati**. Diagnosi (workflow multi-agente):
  ripetizione = cache/determinismo; qualità povera = prompt; + BUG chiave `MULTIPLE_CHOICE_QUIZ`
  mancante (prompt vuoto). Fix: nuove chiavi MC + riscrittura DYNAMIC_QUIZ/FLASHCARD (varietà
  cognitiva, anti-memorizzazione, distrattori, BES/DSA); `{{nonce}}` + temp 0.7 (+ marker
  `_respectTemp` sbloccato su bridge Infomaniak, sanitizzato prima di Google); bottone
  "Rigenera" (pill Set di Studio + player); shuffle opzioni live; cloze seedato; motore
  `generateDynamicQuiz` condiviso in-app/Live; esempio "Bergier" rimosso dal prompt dungeon;
  fillPromptTemplate replacer-funzione (no corruzione `$$` KaTeX). **Reveal risultati**
  (default ON, toggle wizard Live): studente a fine sessione vede % (su risposte date) +
  giuste/sbagliate + spiegazione, salvabile — `computeStudentResult`, `/api/finish` +
  `/api/my-result` gated (token+deviceId, soluzioni solo dopo consegna), dashboard student.html.
  E2E browser verificato contro server reale.

**⚠️ DA FARE (prossima sessione):**
1. **Test device reali** (TEST-CHECKLIST.html): quiz con AI vera Google+Infomaniak
   (qualità + non-ripetizione tra 2 generazioni stesso ramo), reveal risultati da telefono,
   smoke Electron 39 (vault/PDF/pacchettizzata), naming progressivo.
2. **Stream profilo "Taratura VERDE"** — 8 file UNCOMMITTED nel working tree (altra sessione,
   NON scritti da Claude): `mappai-teacher-profile.js` (nuovo), `app.js`, `index.html`,
   `branch-synthesis.js`, `print-dossier.js`, `kg-extraction.js`, `mm-extraction.js`,
   `it_translations.js`. Testare e committare (serve conferma utente). Dentro
   index.html/app.js/it_translations 3 pezzetti di Claude ci viaggiano (bottone ↻ nel player,
   fix-leak non-Electron Google, chiavi IT `ui_regen`).
3. **Pulizia**: cancellare `*.bak-quiz` (backup prompt) quando il quiz è validato.
4. **Merge `chore/electron-39` → main**.

> Nota metodo (git senza staging interattivo qui): per estrarre commit puliti da un working
> tree con feature intrecciate nello STESSO file, usato: `git checkout HEAD -- file` + riapplico
> solo l'hunk voluto (es. buildCredentials), oppure `head -n` per troncare test appesi in coda,
> verificando lo stato committato in isolamento (checkout HEAD temporaneo dei chiamanti) prima
> del commit, poi restore dai backup. Documentato qui per riuso.

### ✅ FATTO (15/7/26): Consumi AI — registro token/costi + dashboard ciambelle drill-down
Richiesta utente (scelte confermate: persistenza su DISCO · documento=progetto/mappa ·
vista IN-APP + stampa · valuta unica CHF con tasso configurabile). Suite **477/477** ✅
(469 storici + 8 nuovi). Retroattività impossibile: il registro parte dalla prima
generazione post-feature.
- **Core puro** `public/js/mappai-usage-core.js` (UMD, +8 test `tests/usage-core.test.js`):
  tassonomia `CATS` (map/materials/study/tutor/live/other + sottovoci), `normalizeRecord`
  (tollerante a righe legacy), `costOf` (Google=USD×tasso→CHF, Infomaniak=CHF diretto),
  `aggregate` (totals/byCat/bySub/byModel/byProvider/unknownModels, una passata),
  `listProjects`/`filterByProject` (chiave `projectId||label`), `donutBy*`, `fmtChf/fmtTok`.
  ⚠️ **I record NON contengono costi** — solo token+modello+provider+contesto+progetto;
  i costi si calcolano a display-time da MODEL_KB + tasso (`mappai_usd_chf_rate`, default
  0.90) → prezzi aggiornabili senza sporcare lo storico.
- **Tracker** `public/js/mappai-usage-tracker.js` (`window.MappAIUsage`): `setContext(cat,
  sub)` sticky + `record()` → IPC `usage-log-append` (fallback localStorage cap 4000 in
  browser). Hook nel choke point `fetchModelAPI` (app.js): snapshot `_usageCtx`
  ALL'ENTRATA (non dopo l'await — flussi concorrenti) + record nel blocco usageMetadata.
  **~30 tag `setContext` nei call site**: mm-extraction (iterativa/phase1/phase3),
  generation-support (phase4/5, enrich×2, validate, split, deepen — alle entry funzione),
  kg-extraction (single/community/multipass), contextual-ai (expand), merge-validate
  (crosslink), branch-synthesis (synthesis×2), print-dossier (nodesheet), timeline,
  study-session (sub dinamica da quizType: quiz_mc/tf/open/flashcards + `opts.usageCat/
  usageSub` override), flashcards-sr (node_quiz), active-study (active_modes),
  meta-analysis (progress), games (dungeon×3), ai-tutor (sidebar/node/quiz),
  admin_prompts (admin_test); live-teacher passa `usageCat:'live'` a generateDynamicQuiz.
- **2 percorsi fuori dal choke point**: TTS voce naturale (branch-synthesis chiama
  generateGemini diretto → record manuale `materials/tts`); **Tutor QR** (main process):
  wrapper su `callModel` in `tutor-start-session` → `usageAppend` cat tutor/qr (estrae
  usageMetadata Gemini O usage OpenAI-shape Infomaniak). Cloze/analisi strutturale =
  zero AI → mai nel registro.
- **main.js**: `usageBaseDir()` (organizzato → `<MappAI - file>/Registro consumi AI/`,
  storico → `~/Documents/MappAI - Consumi AI/`), `consumi-ai.jsonl` append-only, IPC
  `usage-log-append`/`usage-log-read` (parse tolerante riga-per-riga)/`usage-open-folder`;
  preload esposto (`usageLogAppend/usageLogRead/usageOpenFolder`).
- **Dashboard** `public/js/mappai-usage-dashboard.js` (`window.MappAIUsageDash.open()`,
  bottone "Consumi AI" accanto ad "Analisi (docente)" in fondo alla landing): overlay
  1160px, sidebar documenti ("Tutte le mappe" + per-progetto con totale CHF), 6 tile
  (chiamate·token in/out·costo in/out·totale), riga provider+modelli, **2 ciambelle SVG
  pure (zero librerie)**: per categoria (click fetta/legenda → sotto-ciambella con
  breadcrumb "← Tutte le categorie") e per modello; tabella dettaglio accessibile
  (alternativa BES/DSA ai grafici); input tasso USD→CHF (re-render live); avviso ambra
  per modelli fuori MODEL_KB; **report stampabile** (window.open, Space Mono, ciambella +
  tabelle per categoria/modello). Stato vuoto con invito.
- i18n: `ui_usage_dash`/`tt_usage_dash` in ENTRAMBI i dizionari (statiche); `ud_*` EN +
  fallback IT inline (regola 13, audit 0 mancanti). Script in index.html dopo
  mappai-landing-teach.
- ✅ Verificato in browser statico (server reale, licensing bypassato solo lato-DOM):
  seed 21 record finti → tiles corrette, ciambelle, drill-down, filtro documento
  (16 chiamate Fotosintesi), tasso 0.9→1.8 raddoppia i costi Google, report stampa
  11KB con SVG, tracker record+zero-skip, stato vuoto, 0 errori console.
  ⚠️ **Da testare in Electron vivo**: generazione reale → righe nel JSONL su disco,
  IPC read/append, "apri cartella", Tutor QR con chiamate AI vere, TTS.

### ✅ FATTO (14/7/26): 010-file-organization — cartella madre unica "MappAI - file" + registro attività/report
Branch `010-file-organization`. Tre richieste utente. **OPT-IN puro**: finché
`mappai-settings.json` non ha `filesOrganized:true`, TUTTI i path restano storici
(~/Documents/MappAI - *) → zero regressioni. Suite **469/469** ✅.
- **Core puro** `public/js/mappai-files-core.js` (UMD): `ROOT_FOLDER`/`SUB`
  (Mappe·Attività di studio·File condivisi·Classi·Giardini), `safeName` (FS-safe,
  conserva accenti/trattini), `isoDate` (AAAA-MM-GG ordinabile), `classFolder`,
  `activityLabel`, `sessionFolderName`/`sessionRelPath` (gerarchia
  Attività di studio/<Classe>/<AAAA-MM-GG · Attività · Mappa — ramo>, deterministica →
  resume idempotente), `LEGACY`/`planMigration` (ribucketing sessioni per classe +
  flat wholesale), `sessionRecordFrom` (riga registro robusta alle 2 forme
  live joined/absent · tutor students/roster). +10 test `tests/files-core.test.js`.
- **(1) main.js — choke point + rewiring**: `readSettings/writeSettings`,
  `filesOrganized()` (flag+filesRoot), `mappaiRootDir()`/`subDir()` + base-dir helper
  (`mapsBaseDir`/`sharedBaseDir`/`classesBaseDir`/`gardensBaseDir`/`activityBaseDir`) e
  `studySessionDir()` (nuova gerarchia se organizzato, slug flat storico altrimenti).
  TUTTI i ~15 `app.getPath('documents')`+`MappAI - X` reindirizzati (vault/live/tutor/
  lavagna/garden/classi/materiali). ⚠️ **I vault utente scelti a mano (pickFolder →
  activeVaultPath assoluto) NON sono toccati**; i progetti referenziano il vault per NOME
  (basename), risolto live via `get-all-vaults`→`mapsBaseDir()` → dopo la migrazione il
  nome→path segue da solo a Mappe (nessun rewrite dei path salvati).
  IPC: `files-root-get/choose`, `files-migrate-preview`, `files-setup` (crea
  MappAI - file+sub, migra con **rename atomico + fallback copia/EXDEV**, log
  `migrazione-log.json`, ritorna `vaultMap`), `files-open-root`. preload esposto.
- **(2) Naming** (scelta utente: per-classe, ISO): sessioni in
  `Attività di studio/<Classe>/<AAAA-MM-GG · Attività · Mappa (— ramo)>`; report interni
  con nomi parlati (report-domande/studenti/costruzione/tutor.html) già esistenti.
  `scope` (ramo L1 coperto) ora PERSISTITO in session.json (live/tutor/collab-server +
  main.js pass-through); live-teacher passa `LT._scope` (label del ramo o '' = mappa intera).
- **(3) Registro attività** (rimpiazza "Quiz & flashcard" nella landing Insegna):
  IPC `study-sessions-list` cammina "Attività di studio" (o le 3 cartelle storiche),
  legge session.json+results.json+report htmls → `sessionRecordFrom`; `study-report-open`
  (`shell.openPath`, allowlist path). `mappai-landing-teach.js`: sezione
  `teach-activities` = una riga per SOMMINISTRAZIONE (attività·mappa · ramo/Tutta la mappa
  · classe · **partecipanti/totale** · data · **bottoni per ogni report**); saved-sets
  demoti a sottolista riapribile. Filtro "solo classe attiva". `mappai-files-settings.js`
  (`window.MappAIFiles.openSettings` + `maybePromptFirstRun` una-volta): sceglie posizione
  → anteprima migrazione → conferma (checkbox "sposta dati" + warning Obsidian) → setup.
- i18n: `ui_teach_activities`/`ui_files_folder`/`lt_activities_*`/`lt_whole_map`/`fx_*`
  con fallback IT inline + EN in `en_translations.js` (regola 13). Audit: 0 mancanti.
- ✅ Verificato: 469/469, tutti i file parse-clean, **pipeline Part 3 provata sui DATI
  REALI su disco** (8 sessioni Live/Tutor → righe corrette: Tutor 2/20 + Report tutor,
  Quiz 12/12 + domande/studenti; materiali-* 0/0 senza report → filtrati).
  ⚠️ **Da testare in Electron vivo**: prompt primo avvio + scelta posizione (dialog),
  migrazione reale delle 7 cartelle (rename + vaultMap + Obsidian re-point), che dopo la
  migrazione i vault si riaprano da Mappe, registro attività con report cliccabili su
  sessione reale, generazione con `scope` valorizzato.

### ✅ FATTO (13/7/26): 008-timeline-live — Timeline via QR (Completa/Costruisci) + LIM + login flessibile
Spec-kit completo (`specs/008-timeline-live/`, branch omonimo). La timeline diventa
attività di classe in MappAI Live. Suite **431/431** ✅. Sei user story:
- **US1 base in-app** — `window.MappAITimeline` in `mappai-timeline.js` (add/remove/list
  su `appState.db.timelineEvents`, persistito col progetto; popup toolbar "+ Aggiungi
  data" + "Modalità esercizio" con card-buco dagli anni citati dalla fonte). Logica pura
  in **`mappai-timeline-core.js`** (UMD: normalizeEvent/eventKey/buildPool/extractYears/
  buildGaps/buildQuestions/validateProposal/proposalFlags/countActive). **Pool AI
  persistito** in `appState.db.timelineAI` (`_persistPool` in `_renderTimeline`, R5 —
  zero token al lancio). `loadProject` init robusto (progetti legacy → array vuoti).
- **US2 "Completa"** (autovalutata) — `gradeAnswer` esteso (evento→anno con `answerYear`/
  tolleranza ±N/periodi; `answerTexts` any-match per anni multi-evento), `cleanAnswer`
  preserva `hintUsed`, `publicQuestions` passa `hint`/`expects`/`tlYear` (soluzioni
  strippate), `computeResults` aggrega indizi. `live-server`/`main.js` pass-through
  `mode`/`loginMode`/`hintMode`/`build`. `student.html`: input anno numerico + 💡
  indizio tracciato. `mappai-timeline-teacher.js` wizard Completa → `MappAILive.
  launchExternal`. 5ª card hub "Timeline". Report: domande in ordine cronologico +
  colonna indizi.
- **US3 "Costruisci"** (discovery, revisione docente) — `live-server` `mode:'build'`
  (`/api/propose` con cap+flags duplicato/anno-non-in-fonti, `/api/review` idempotente;
  proposte in status/close). `timeline-build.html` (pagina studente self-contained).
  Dashboard revisione (polling 3s; approva → `MappAITimeline.add(origin:'student')` →
  entra nel progetto). `buildTimelineWorkshopReportHtml` (proposte per allievo + timeline
  finale). ⚠️ 2 bug catturati dai test: `poolKeys` droppato dal config, `author` mancante
  sui proposal.
- **US4 proiezione LIM** — `MappAITimelineLive.openProjection` (fullscreen, QR angolo,
  timeline che cresce con le approvate ≤3s, ESC per uscire).
- **US5 login flessibile** — `live-server` `loginMode:'group'` (join per nickname) +
  `collab-server` `loginMode:'individual'` (join emoji+numero dal roster). Scelta al
  setup Timeline e all'avvio Lavagna (roster dalla classe attiva). Default storici
  invariati. FIX `LIMITS`→`LC.LIMITS`.
- **US6 tab LIM** — `#sidebar-tab-lim` + pannello + `switchSidebarTab('lim')` (kill-switch
  `mappai_lim_tab='0'`). `renderLimSidebarTab` (card Lavagna/Timeline + dashboard attiva
  montata via host coesistente → Struttura resta, zero regressioni 006).
- ✅ Verificato E2E in browser CONTRO SERVER REALE: US1 popup (pool persistito, add/fill/
  delete, esercizio), US2 (grading ±2/±3, indizi, report, player year-input), US3 (propose
  gap → approve → "approvata"), US6 (tab+card+moduli). Test: `timeline-core` (21),
  `live-core` (+8), `live-server` (+3 build/group), `collab-server` (+2 individual).
  ⚠️ **Da testare in Electron vivo** (quickstart.md): wizard reale + AI-free launch, telefono
  su LAN, proiezione LIM su mappa reale, tab LIM switch (index.html gated in browser), 2 device.

### ✅ FATTO (13/7/26): Sintesi — voce naturale come lettore in-app + condivisione QR + fix font
Tre richieste utente sulla "Sintesi di ramo/mappa" (`mappai-branch-synthesis.js`).
- **(3) Font topbar** — la barra fissa del documento stampabile (`_buildSynthesisPrintHtml`)
  hardcodava `font-family:monospace` (mono di sistema) → cambiato in `'Space Mono',monospace`.
  Titolo + bottoni ereditano → tutta la topbar in Space Mono. Space Mono era già caricato
  (link Google Fonts) e usato dal body: solo quel `<div>` sovrascriveva.
- **(1) Voce Google come LETTORE in-app** (scelta utente: "naturale quando generata", voce di
  sistema come fallback). Il motore condiviso `mappai-tts-reader.js` ha ora una **modalità
  naturale** completamente gated dietro `E.isNatural`: `MappAITTS.setNaturalAudio(bodyEl, url)`
  pilota un `<audio>` con lo stesso chip (play/pausa, ±sec, ×velocità via `playbackRate`,
  scrub) e karaoke APPROSSIMATO (Gemini non dà timestamp → durate riscalate sulla durata reale
  dell'audio via `_rescaleToDuration`). Fallback automatico alla voce di sistema se l'audio non
  carica (`error` handler). Attiva SOLO per il corpo `#branch-synthesis-body` registrato → tutte
  le altre superfici di studio restano su `speechSynthesis`, invariate. Branch nei punti di
  controllo: `_load`/`_speakCurrent`/`_playFrom`/`_pause`/`_stop`/`_finish`/`_seekToTime`/
  `_globalTime`/`_startTicker`/`_cycleRate`. Il pulsante "Audio voce naturale" ora **genera una
  volta, cachea il WAV su `_lastSynthesis._audioBlob/_audioUrl` e lo aggancia al lettore** (▶
  suona la voce Google) invece di forzare il download. Ri-registra all'apertura del modale.
  ⚠️ **Cambio di comportamento**: rimosso il download diretto del WAV (superato da ascolto in-app
  + QR). `_buildSynthesisWavBlob`/`_ensureSynthesisAudio` estratti come helper riusabili.
- **(2) Condivisione con la classe via QR** (scelta utente: Materiali QR, file audio separato).
  Nuovo bottone "Condividi (QR)" → `shareSynthesisWithClass()`: pubblica su MappAI Live →
  Materiali la pagina HTML della sintesi (lettore integrato + modalità dislessia) e, se c'è la
  chiave Gemini, il **WAV voce naturale** servito accanto. Gli allievi la aprono via QR, senza
  login, con player `🔊 Voce naturale`. Senza chiave degrada al solo lettore a voce di sistema.
  Wiring: IPC `live-materials-add-bytes` (main.js + preload), MIME audio (`.wav/.mp3/.m4a/.ogg`)
  in `live-server.js`, `MappAILive.shareDocWithAudioQr(htmlName, buildHtml, audioName, audioB64)`
  in `mappai-live-teacher.js` che **tokenizza l'URL audio** (`?s=<token>&inline=1`, i /files sono
  gated + `Content-Disposition:attachment` di default). `_buildSynthesisPrintHtml(data, opts)`
  accetta `opts.audioSrc` per iniettare il player `<audio controls>` in cima (no-arg = invariato,
  usato da stampa/salvataggio archivio).
- i18n: chiavi EN nuove (`bs_audio_ready`, `bs_natural_voice`, `bs_share_*`) + `bs_audio_tip`
  aggiornata; IT è il fallback inline (regola 13). Suite **382/382** ✅, tutti i file parse-clean.
- ⚠️ **Da testare in Electron vivo** (browser statico non esercita generateGemini/liveMaterials
  né supera il licensing): genera sintesi → "Audio voce naturale" → ▶ suona voce Google;
  "Condividi (QR)" → telefono apre la pagina → player naturale in streaming; footer a 4 bottoni
  sul modale 680px da controllare a occhio; 2 device su Wi-Fi.

### ✅ FATTO (13/7/26): 007-tutor-qr — Tutor AI via QR, attività "Chatta e Scrivi"
Spec-kit completo (`specs/007-tutor-qr/`, branch omonimo). QUINTA attività live:
lo studente entra via QR con le credenziali di classe, chatta col Tutor AI
sull'argomento assegnato (modalità + CAP SCAMBI del docente), poi redige e
consegna un testo personale. Report docente = TESTO + TRASCRIZIONE per studente
(processo, non solo prodotto). Suite **397/397** ✅.
- **Proxy AI — la chiave NON lascia mai il main**: helper `callModel({provider,
  apiKey, payload, model|productId})` estratto in `main.js` dagli IPC
  `generate-gemini`/`generate-infomaniak` (che ora lo richiamano, comportamento
  invariato; `callGemini`/`callInfomaniakChat` con `err.status` per il backoff).
  Il tutor-server (stesso processo) lo chiama in-process; apiKey+systemInstruction
  arrivano via IPC `tutor-start-session` come `opts.secrets` e NON vengono mai
  persistite né servite ai telefoni (publicState = WHITELIST nel core).
- **Core puro** `public/js/mappai-tutor-core.js` (UMD): `LIMITS` (msgMax 600,
  maxTokens 400, cap 1-30), `canSpend`, `validateMessage`, `publicState`,
  `buildChatPayload` (google systemInstruction/contents · infomaniak messages
  OpenAI, MAI responseMimeType), `extractText`, `computeTutorResults`
  (flag `neverChatted` per consegne senza chat). +7 test.
- **Server** `tutor-server.js`: `createTutorServer` (porte **8769-8779**, cartella
  `~/Documents/MappAI - Tutor/<mappa>-<classe>-<data>/`, session.json SENZA
  segreti + students/<id>.json autosave, ripresa crash-safe stesso token).
  API: session (publicState+emojiSet) / join (409 identity-taken, rientro con
  chat+bozza) / **tutor** (cap+validazione PRIMA dell'AI → coda `enqueue`
  SERIALIZZATA con retry su 429 + flag providerSlow; **riserva ottimistica di
  `used`** con rollback — senza, N invii simultanei bucavano il cap) / draft /
  submit / status / reopen / close (results.json + report). +8 test (callModel
  MOCKATO: prova che cap/validazione bloccano senza chiamate AI e che la coda
  è seriale — max 1 in volo su 5 simultanei).
- **Pagina studente** `public/tutor/student.html` (self-contained, stile MappAI):
  login emoji+numero → tab **💬 Esplora** (chat, contatore scambi, cap → chat
  chiusa + invito a scrivere) / **✍️ Scrivi** (brief del docente, autosave
  debounce, sempre accessibile) → **📮 Consegna** (riconsegna permessa). Rientro
  stesso device ritrova chat+bozza dal server.
- **Docente** `public/js/mappai-tutor-teacher.js` (`window.MappAITutor.open/
  openSetup/openDashboard`): wizard classe→argomento (L1 MindMap / top-8 hub KG)
  →modalità (le 6 TUTOR_MODE_*)→cap→consegna; la **systemInstruction è costruita
  nel renderer** (persona + TUTOR_MODE_* + contesto argomento CAPPATO 900+500
  char + REGOLA ANTI-REDAZIONE "mai scrivere il testo al posto dello studente" +
  anti-manipolazione + classTuningPrompt) e passata al main → il telefono non può
  alterarla. Dashboard QR + griglia stati (polling 3s: fase/used/cap/✓ +
  "Sblocca" reopen) + "Chiudi e genera report" (apre il report, poi stop server).
  Registro sessioni: `logSession({activity:'tutor'})` → chip classe in Insegna.
  Modello/credenziali dal provider ATTIVO (stessa fonte di fetchModelAPI).
- **Report** `public/js/mappai-tutor-reports.js` (UMD): `buildTutorReportHtml` —
  scheda per studente con testo consegnato + chat affiancati, badge
  "0 scambi col tutor" sulle consegne senza processo.
- **Hub**: 4ª card "Chatta e Scrivi (Tutor AI)" in `openLiveHub`. IPC:
  `tutor-start/stop-session`, `-session-info`, `-open-folder` (main+preload).
- i18n: `lv_card_tutor*`/`tq_*` in `en_translations.js` (fallback IT inline).
- ✅ Verificato E2E in browser CONTRO SERVER REALE (AI mockata): login volpe-03 →
  3 scambi (contatore 0/3→3/3, cap chiude la chat) → scrittura+autosave →
  consegna → file su disco (6 turni, phase submitted, ZERO segreti in
  session/students/report) → close → report con testo+trascrizione. Moduli
  caricano nell'app senza errori console.
  ⚠️ Da testare in Electron vivo (quickstart.md): wizard reale, chiamata AI VERA
  su entrambi i provider (Google + Infomaniak), telefono su LAN, 25 studenti.

### ✅ FATTO (12/7/26): 006-lavagna-sidebar — dashboard Lavagna in sidebar + sblocca + resize
Spec-kit completo (`specs/006-lavagna-sidebar/`, branch omonimo). La gestione della
Lavagna collaborativa esce dal popup che copriva la mappa e vive nel tab Struttura
della sidebar + pannello fluttuante staccabile (LIM). Suite **382/382** ✅.
- **Renderer riusabile** (`mappai-collab-teacher.js`): `renderCollabPanel(targetEl, opts)`
  monta QR+URL+gruppi+bottoni in un contenitore qualsiasi; elementi per-host via CLASSI
  (`.cl-qr/.cl-groups/.cl-stop/.cl-folder/.cl-detach`), non id → più host coesistono.
  `CT.hosts[]` = contenitori montati; `renderGroupsList` itera tutti gli host (sidebar
  + floating + modale) allo stesso tick. `showDashboard()` sceglie sidebar (default) o
  modale (kill-switch `mappai_collab_legacy_modal='1'`). `mountSidebarPanel` →
  `#collab-sidebar-panel` (nel tab Struttura) + `switchSidebarTab('structure')`.
  `openFloatingPanel`/`toggleFloatingCollapse`/`closeFloatingPanel` → `#collab-float-panel`
  (`position:fixed`, collassabile). `openDashboard` RIMOSSO (sostituito da showDashboard).
- **Sblocca** (US2): endpoint `POST /api/reopen {adminToken,nick}` in `collab-server.js`
  (gemello di `/api/release`) → `g.done=false` + persist. Bottone "Sblocca" (icona unlock)
  in `groupsHtml` visibile SOLO se `g.done`; `reopenGroup(slug)` fa la fetch +
  aggiornamento ottimistico. Lo studente NON è bloccato (nessun lock lato studente):
  "sblocca" pulisce solo il ✓ lato docente. +3 test in `tests/collab-server.test.js`.
- **Albero collassato di default** (US4): `window.collapseAllTree(opts)` in
  `mappai-ui-modals.js` popola `window.collapsedTreeNodes` (Set esistente) coi nodi
  radice (L1 MindMap / top-8 hub KG — l'albero è a 2 livelli, solo le radici hanno la
  freccia). Idempotente per-mappa (`_treeCollapsedFor` = firma mappa). Hook in
  `mappai-d3-render.js` `initD3Visualization` prima di `renderTreeView`. Kill-switch
  `mappai_tree_expanded_default='1'`. Bottone "Condividi la Lavagna (QR)" in fondo a
  `#tree-view-container` → `openCollabHub`.
- **Sidebar ridimensionabile** (US5): nuovo `mappai-sidebar-resize.js`
  (`MappAISidebarResize`), maniglia `#sidebar-resizer` (bordo destro, `col-resize`,
  `hidden md:block`). Drag pointer → `width/min/max-width` inline `!important` (batte i
  `!important` di `.app-sidebar` in style.css senza toccarlo). Clamp **min 320 / max 50%
  innerWidth**; persist `mappai_sidebar_width`; re-clamp su `window.resize`. `#sidebar`
  ora ha `relative`.
- i18n: `ui_collab_start_qr` in ENTRAMBI i dizionari; `cl_reopen`/`cl_reopen_tip`/
  `cl_detach`/`cl_dock`/`cl_collapse` in `en_translations.js` (fallback IT inline). Audit ok.
- ✅ Verificato in browser statico: 0 errori console, API/elementi presenti,
  `renderCollabPanel` costruisce QR+gruppi+bottoni con "Sblocca" SOLO sui gruppi done,
  SOLO/ON/JSON/rename/Stacca presenti. Suite 382/382.
  ⚠️ Da testare in Electron vivo (quickstart.md): albero collassato su mappa reale
  (`collapseAllTree` usa `appState` lessicale, non testabile via `window.appState`),
  resize drag, pannello fluttuante, sessione end-to-end con sblocca + telefono, 2 device.

### ✅ FATTO (12/7/26): 005-landing-insegna — landing doppia "Costruisci/Insegna"
Spec-kit completo (`specs/005-landing-insegna/`, branch omonimo). Boot diretto senza
launcher + toggle di modalità sotto l'hero (INTATTA); Costruisci = generazione MM/KG
attuale + sezione progetti collassabile con assegnazione grade; Insegna = cruscotto di
lezione (3 sezioni collassabili + filtro classe + 3 quick-start QR in ≤4 click).
- **Avvio**: `main.js` `bootPrimaryWindow()` → `createWindow()` diretto. Kill-switch
  `<userData>/mappai-settings.json` `{"legacyLauncher":true}` (letto SYNC) ripristina il
  launcher storico; `launcher.html`, `createLauncherWindow`, IPC `launcher-return` intatti.
  Studio garden raggiungibile dal menu "Knowledge Garden".
- **Core puro** `public/js/mappai-teach-core.js` (UMD): `normGrade` (NFKD, ª/°→a),
  `registryAdd` (cap 400 FIFO immutabile), `classesForMap`, `rankMapsForClass` (3 fasce
  started/sameGrade/others, totale mai vuoto), `buildSetsIndex`, `filterByClass`.
  +15 test `tests/teach-core.test.js` → suite **379/379** ✅.
- **UI** `public/js/mappai-landing-teach.js` (`window.MappAITeach`): toggle modalità
  (`mappai_landing_mode`), filtro classe (`mappai_teach_class_filter`), sezione progetti
  Costruisci con menu grade, 3 sezioni Insegna (Progetti con chip classi / Materiali /
  Quiz&flashcard), quick-start `quickStart('collab'|'live'|'materials')` (picker classe →
  mappa 3 fasce / documento → loadProject → hub), `editGrade`, `logSession`.
- **HTML** (`index.html`): toggle bar sotto hero, wrapper `#build-content`/`#teach-content`
  DENTRO glass-card (racchiude anche quick-actions+meta come in origine), sezione
  collassabile `#build-projects-section` (chiusa default), drawer `#projects-bar` RIMOSSO.
  ⚠️ FIX preesistente: `generation-details-card` non chiudeva (bug latente error-corrected
  dal browser) → aggiunto `</div>` esplicito, altrimenti il wrapper rompeva il nesting.
- **Store nuovi** (localStorage): `mappai_session_registry` (scritto ad avvio riuscito di
  Lavagna/Live/Materiali in collab-teacher/live-teacher/quickStart), `mappai_studysets_index`
  (scritto in `saveCurrentProject` da `appState.db.studySets`, mai riparsando snapshot),
  `mappai_landing_mode`, `mappai_teach_class_filter`. Campo **`grade`** su `tutor_ai_projects`
  (PRESERVATO in saveCurrentProject; eredita dal chip in Insegna via `inheritGrade`).
- **Archivio esteso** (`mappai-study-export-core.js`): `DOCS_CAP` 12→**30**, allowlist kind
  `synthesis/dossier/nodesheet/timeline`, campo `pdf` (data-URI). Foglio nodi archiviato come
  PDF (`mappai-print-dossier.js` dopo `doc.save`), Timeline come HTML (`mappai-timeline.js`
  in `_renderTimeline`). `openSavedDocsModal` (menu-hubs) apre i PDF con window.open.
- **API esposte**: `MappAILive.openSetup`/`openMaterials` (one-liner in live-teacher),
  `StorageManager.renderRecentProjects(containerId?, {gradeMenu, classChips, onlyIds, emptyMsg})`.
- i18n: chiavi statiche `ui_landing_*`/`ui_teach_filter_*`/`ui_build_projects` in ENTRAMBI i
  dizionari; `ui_teach_*`/`ui_qs_*`/`lt_*`/`rp_grade`/`rp_classes`/`sd_pdf_no_qr` con fallback
  IT inline + EN in `en_translations.js`. Audit i18n: 0 mancanti nei due versi.
- ✅ Verificato in browser (static server, license gate bypassato solo lato-DOM per la vista):
  toggle+persistenza, teach mode (chip classe, quick-start picker classe→mappa 3 fasce,
  modale grade), build mode (form intatto + sezione progetti collassabile + grade), zero
  errori console. Suite 379/379.
  ⚠️ Da testare in Electron vivo (quickstart.md): boot diretto reale, kill-switch, avvio
  sessioni QR con registro scritto, eredità grade, apertura documenti archiviati, 2 device.
  US2/US3 flussi live (openCollabHub/openSetup/openMaterials) provati solo a livello di
  picker (server LAN non attivo nel browser statico).

### ✅ FATTO (11/7/26): MappAI Live — hub QR (Studio attivo live + Materiali + Account classi)
Terzo server fratello di garden/collab (stessi pattern: HTTP Node puro via IPC, token
studente nel QR + adminToken, allowlist statica, autosave + ripresa crash-safe con stesso
token). Bottone menu azioni **"MappAI Live"** (`radio`, sostituisce Lavagna che resta card
dell'hub) → `window.openLiveHub()`. Porte quiz **8767-8777**, materiali **8768-8778**
(basi distinte da garden 8765 / collab 8766 → i 4 server coesistono).
- **Core puro** `public/js/mappai-live-core.js` (UMD): `EMOJI_SET` (12 emoji, identità =
  chiave ascii `volpe-03`, MAI il glifo → zero problemi codepoint), `buildCredentials`
  (coppie uniche emoji+num 00-10, max 132), `normalizeClassName` (NFKD: "2ª A"≡"2a A"),
  schema `mappai-live-question@1` (tf/mc/cloze/open), `publicQuestions` (**strippa le
  soluzioni** prima dell'invio agli studenti), `tfFromMc`/`mcFromItem`, `buildL1Resolver`
  (replica pura del parent-walk di entity-backbone), `gradeAnswer` (cloze parziale, open
  fuzzy `answerMatches`, blank/skip/manual), `rateFromMs`, **`computeResults`** = modello
  dati unico dei 2 report (heatmap domande + schede; accuratezza SOLO su attempted, blank
  a parte; topic per L1, custom senza nodeId esclusi dai topic; forte ≥0.8 con ≥2 item,
  debole <0.5 o ≥50% bianchi). +23 test `tests/live-core.test.js`.
- **Report puri** `public/js/mappai-live-reports.js` (UMD): `buildQuestionsReportHtml`
  (heatmap giusto/sbagliato/bianco/a-mano, assoluti+%), `buildStudentsReportHtml` (una
  scheda per allievo: pill per domanda, accuratezza, fluenza, punti forti/deboli),
  `buildCredentialCardsHtml` (foglio credenziali stampabile). Stili tipo `QP_BASE_STYLES`.
- **Server** `live-server.js`: `createLiveServer` (fase lobby→running→closed; `/api/join`
  valida roster [409 identity-taken / release→adozione / stesso device rientra con risposte],
  `/api/answer` sovrascrivibile fino a chiusura [Indietro] + `skipped` esplicito + autosave
  per-risposta su `students/<id>.json`, `/api/phase` arma timer `endsAt`, `/api/close`
  idempotente → `results.json` + 2 report HTML, `/api/report`; timer = setTimeout + ri-armo
  al resume + guardia lazy). `createMaterialsServer` (`/files/<name>` basename-only,
  Content-Disposition, **nessun login**). +5 test `tests/live-server.test.js`.
  Cartella sessione `[titolo mappa]-[attività]-[classe]-[DD-MM-AAAA]` in
  `~/Documents/MappAI - Live/`.
- **Pagine studente** `public/live/student.html` (login classe/emoji/numero con
  `inputmode=numeric` → lobby → player con **← Indietro / Salta / Avanti** + sync dot +
  countdown + retry offline → fine con Consegna) e `materials.html`. Stile MappAI (Space
  Mono, palette indigo/slate, sfondo puntinato, Noto Color Emoji), zero Tailwind. Boot da
  `/api/session`, `deviceId` in localStorage, risposte mirror in localStorage.
- **Account classi** `public/js/mappai-live-classes.js`: `window.MappAIClasses` store su
  **disco** `~/Documents/MappAI - Classi/classi.json` (IPC, fallback localStorage), modale
  `window.openClassAccountsModal()` (bottone nel footer Profilo Studente): crea classe
  (nome/anno/n. allievi → credenziali), nome allievo **opzionale** per riga, stampa
  credenziali, elimina. Login individuale SOLO per Studio attivo live; Lavagna resta a
  nickname di gruppo; Materiali senza login.
- **Hub docente** `public/js/mappai-live-teacher.js`: `openLiveHub()` (3 card — Studio
  attivo live / Lavagna→`openCollabHub` intatta / Materiali), `openLiveSetup()` wizard
  (classe → modalità V/F|MC|Cloze|Domande mie → scope mappa/ramo L1 → quantità/timer),
  generazione: MC via `MappAIGames.genQuizForNode` (+cache dungeon, export 1 riga), V/F via
  `tfFromMc`, cloze via `MappAIClozeCore.makeCloze` (export 1 riga), custom = editor inline;
  `buildL1Resolver` su ogni domanda. Dashboard QR + proiettore + griglia roster (polling 3s
  diretto a `127.0.0.1:<port>/api/status`), avvia domande, countdown, chiudi → report
  domande/studenti + apri cartella. `openMaterialsPanel()` + helper `MappAILive.publishHtml`.
- IPC main.js: `live-start/stop-session`, `-session-info`, `-open-folder`, `live-materials-*`,
  `live-classes-load/save`. i18n: `ui_class_accounts`/`ui_live_hub`/`tt_live_hub` in ENTRAMBI
  i dizionari; `lv_*`/`cls_*` con fallback IT inline + traduzione EN in `en_translations.js`.
- ✅ Verificato in browser CONTRO SERVER REALE: flusso studente end-to-end (login emoji →
  lobby → 4 tipi di domanda → autosave su disco → done), i 2 report renderizzati, hub +
  wizard + editor custom + modale Account classi + generazione credenziali. Suite **361/361**.
  ⚠️ Da testare in Electron vivo: avvio sessione via IPC, dashboard polling, QR da telefono
  reale su LAN, generazione MC via AI, 2 dispositivi Wi-Fi.

**Addendum (11/7/26): classe = CONTESTO ATTIVO che tara l'AI.** Modello scelto con l'utente:
le mappe restano condivise (nessun lock), ma la **classe selezionata governa la taratura
della generazione** al momento della creazione (le schede fonte sono già diverse per classe
→ nessuna "ri-adatta", niente varianti). La classe è una lente globale, non un login duro.
- **Oggetto classe esteso** (`classi.json`): `grade`, `system`, `register`
  (semplice/medio/ricco → preset `REGISTERS` con istruzione per l'AI), `notes` (testo libero
  BES/DSA/culturale). Sezione **"🎯 Taratura AI"** nel `renderEdit` di Account classi.
- **Classe attiva** (`mappai-live-classes.js`): `MappAIClasses.getActive/setActive/activeId`
  (`localStorage 'mappai_active_class'`), `buildTuningBlock`/`tuningForPrompt` → blocco
  "PROFILO CLASSE" (Classe/sistema · registro · note · "resta fedele alla fonte, adatta solo
  COME esprimi"). '' se generico → comportamento invariato.
- **Iniezione unica** in `buildSystemInstruction` (app.js): dopo il FOCUS DISCIPLINARE appende
  `MappAIClasses.tuningForPrompt()`. Copre TUTTA la generazione (MM iterativa/multipass, KG
  single/community/multipass, espandi-con-AI, sotto-concetti) — è il choke point comune.
- **Chip "classe attiva"** in header (`#header-utils`, `graduation-cap`, mostra nome o
  "Generico") → `openClassSwitcher` (modale: Generico + classi, attiva evidenziata, sottotitolo
  grade·registro, "Gestisci classi"). **Picker al primo avvio** una volta per sessione
  (`sessionStorage 'mappai_class_prompted'`). Live setup wizard: `#lv-class` default alla
  classe attiva. Evento `mappai-active-class-changed` per altri moduli.
- i18n: `cls_*` di taratura con fallback IT inline + EN in `en_translations.js`.
- ✅ Verificato in browser (harness): chip Generico→1ª A, switcher, campi taratura persistono,
  `buildTuningBlock` corretto, `buildSystemInstruction` = base + blocco quando attiva / base
  quando generico. Suite 361/361. ⚠️ Electron vivo: chip nell'header reale + picker al lancio.

**Follow-up FATTO (11/7/26): taratura estesa a TUTTI i generatori AI + tab NPC nascosta.**
- Helper unico in app.js: `window.classTuningPrompt()` (blocco classe attiva o '') e
  `window.injectClassTuning(payload)` — accoda la taratura al `systemInstruction` se esiste,
  altrimenti ne crea uno; **no-op se generico** (zero cambi su Google e Infomaniak).
- Iniettato in tutti i generatori che NON passano da `buildSystemInstruction`: quiz+flashcard
  (`mappai-study-session.js`), quiz MC per-nodo (`mappai-flashcards-sr.js`), i 3 payload del
  tutor (`mappai-ai-tutor.js`), timeline (`mappai-timeline.js`), quiz live MC
  (`mappai-games.js:_genQuizForNode`, path cloud), arricchimento desc
  (`enrichL1Descs`/`enrichThinDescs` in `mappai-generation-support.js`). La generazione mappa
  MM/KG + espandi + sotto-concetti erano già coperte da `buildSystemInstruction`.
  **Cloze = deterministico (zero AI)** → eredita la taratura dalle desc già tarate, niente da
  iniettare. Path local-LLM del quiz dungeon non toccato (offline, poco rilevante).
- Verificato in harness: injectClassTuning corretto su payload con/senza systemInstruction,
  generico → no-op, attiva → BASE preservata + blocco accodato (nessun newline iniziale).
- **Nessun nuovo prompt admin-gestibile**: la taratura è un blocco costruito in JS (come
  `buildDisciplineSystemPrompt`), il knob editabile sono i preset registro + le note classe.
- **Tab "NPC" (Sapienti) nascosta** nel pannello admin prompt (`index.html`, classe `hidden`
  sul bottone `data-tab="NPC"`): serviva solo al Memory Dungeon. Dati/gestione NPC restano,
  fuori dalla UI. Le altre 5 tab (Mappe/KG/Tutor/Studio/Discipline) intatte. Suite 361/361.

**Follow-up FATTO: quiz Live = qualità quiz in-app (parità generatore).**
- Prima il quiz live MC usava `MappAIGames.genQuizForNode` (formato "completamento" del
  dungeon: incipit + 3 completamenti) → qualità inferiore ai quiz di MappAI.
- Ora estratto `window.generateDynamicQuiz({nodeLabel, material, quizType, quantity, apiKey})`
  in `mappai-study-session.js` (stesso motore `DYNAMIC_QUIZ` del quiz di Studio: domande vere
  con opzioni + spiegazione, `quizType` per MC o V/F nativo; injectClassTuning incluso).
- Live (`mappai-live-teacher.js`): `generateQuizViaStudy` lo chiama PER-NODO (material = desc
  del nodo), mappa gli item allo schema live via `dynItemToLive` (MC: indice del corretto per
  stringa o numero; V/F: `statementTrue` da "Vero/Falso"; scarta se non mappabile), attacca
  nodeId+l1. Fallback a `genQuizForNode` solo se il nuovo motore non produce nulla.
- Verificato il mapping in Node (MC stringa→indice, 1-based→0-based, V/F Vero/Falso, scarto
  non mappabile). Suite **428/428** ✅. ⚠️ Da provare in Electron vivo con AI reale.

**Follow-up FATTO: badge/toggle provider AI (privacy dati studente).**
- Motivazione: nel Tutor QR ("Chatta e Scrivi") il testo degli STUDENTI va all'AI a runtime →
  il docente deve sapere/scegliere su quale provider (Google vs Infomaniak svizzero/GDPR).
  Quiz/cloze/timeline generano l'AI PRIMA della sessione (contenuto mappa, non PII) → lì basta
  un badge di trasparenza.
- Helper globali in `app.js`: `getProviderKey(p)` (chiave del provider SCELTO, non solo
  l'attivo), `aiProviderLabel(p)` ('🇨🇭 Infomaniak (Svizzera)' / 'Google (Gemini)'),
  `aiProvidersAvailable()` (provider con chiave configurata).
- **Tutor QR** (`mappai-tutor-teacher.js`): `providerConfig(override)` legge le credenziali del
  provider scelto; wizard mostra **selettore** se ≥2 provider configurati (default = attivo,
  NESSUNA memoria), **badge** se 1 solo; su Avvia usa il provider scelto e blocca se Infomaniak
  senza Product ID. La chiave viaggia come prima (opts→callModel in-process, MAI ai telefoni).
- **Live quiz** (`mappai-live-teacher.js`): badge sola lettura "Domande generate con: <provider>"
  nel wizard (il toggle vero lì = fase 2, richiederebbe override di fetchModelAPI).
- i18n: `tq_provider`/`tq_provider_badge`/`tq_need_productid`/`lv_provider_badge` (EN + IT inline).
- Verificato: logica helper in Node (0/1/2 provider), badge Infomaniak reso nel Live setup in
  harness (nessun errore console). Suite **431/431** ✅. ⚠️ Electron vivo: selettore Tutor con
  entrambe le chiavi + avvio reale su Infomaniak.

### ✅ FATTO (11/7/26): 003-lavagna-collaborativa — Kahoot/Slido su LAN + motore layer
Spec-kit (`specs/003-lavagna-collaborativa/`). Fratello architetturale del Knowledge
Garden (stessi pattern: server HTTP Node puro via IPC, token nel QR, adminToken,
allowlist statica, persistenza crash-safe, ripresa da disco con lo stesso token).
- **Core puro**: `public/js/mappai-collab-core.js` (UMD — sanitize nick/testo,
  `validateStudentNode`, `mergeGroupNodes` last-write-wins cap 30, `layerToGraph` →
  JSON mappa MappAI root L0 + nodi L1 rel "propone") + `tests/collab-core.test.js` (13).
- **Server LAN**: `collab-server.js` (porte 8766-8776, storage
  `~/Documents/MappAI - Lavagna/<slug>/` con `groups/<slug>.json` per gruppo +
  `board.json`). API: session/join (409 nick di altro device, ripresa stesso device,
  adozione gruppo rilasciato)/nodes (merge+422)/board/status admin/release.
  `tests/collab-server.test.js` (12, incluso stop→restart con token identico).
- **Pagina studente**: `public/collab/student.html` self-contained (join nickname,
  editor SVG con root al centro, nodi rect testo≤80+palette 8+taglie S/M/L,
  drag pointer-events, edit/delete, sync automatico debounce 800ms con indicatore,
  "Mostra classe" polling 5s, deviceId in localStorage). ✅ VERIFICATA E2E in browser
  CONTRO SERVER REALE: join → 2 nodi → sync su disco → drag (pointer events) → board.
  ⚠️ il drag col tool di automazione non emette pointermove: testato via dispatch
  programmatico — su device reali funziona (stesso stream di eventi).
- **Docente**: IPC `collab-start/stop-session`, `collab-session-info`,
  `collab-open-folder` (main.js + preload); `mappai-collab-teacher.js`
  (`window.openCollabHub()`: avvio con istruzioni rete hotspot/router, QR grande +
  fullscreen LIM, dashboard gruppi polling 3s diretto su 127.0.0.1, toggle+rinomina
  layer, export `vault-dinamico-<gruppo>.json` importabile); overlay
  `g#collab-overlay` a raggiera attorno al root — MAI dentro `appState.db`.
  Voce menu "Lavagna collaborativa" (presentation) sotto Knowledge Garden.
- i18n: `ui/tt_collab_board` in ENTRAMBI i dizionari; `cl_*`/`tst_collab_*` in EN.
- **Rifiniture (11/7/26 sera, richiesta utente)**: pagina studente = VIEWPORT dell'app
  (sfondo `#fafbff` + puntini `#ddd6fe`, Space Mono, root cerchio r45 `#0f172a` con
  label centrata identica al L0); label più grandi (13/15/17) con alone bianco
  `paint-order: stroke` (stile `.node-text`); gate **"Fatto ✓"** (flag `done` in
  core/server/board, "Mostra classe" bloccato con hint finché non si consegna, badge ✓
  in dashboard docente); tool **"⇢ Collega"** con keyword (tap A→B→dialog; edit/delete
  dal label; `validateStudentLink`/`mergeGroupLinks` nel core, frecce+label con alone
  su studente E overlay docente; `layerToGraph` esporta i link con la keyword, root
  "propone" solo sui nodi senza entranti). UX ispirata a MiniMAP (~/Claude/minimap):
  dot-grid, label con alone, keyword sugli archi. E2E ri-verificato contro server reale.
  Suite **333/333** ✅ (18 core + 14 server).
- ⚠️ T014 pendente: verifica in Electron vivo + 2 device Wi-Fi reali (serve l'utente).
- Risposta alla domanda Jigsaw degli Appunti: il motore layer (toggle+rinomina) è
  questo; l'integrazione del reconcile Jigsaw sugli stessi layer = follow-up.

### ✅ FATTO (11/7/26): 002-affinamenti-output — PDF vettoriale, sintesi mappa intera, keyword foglie
Spec-kit (`specs/002-affinamenti-output/`, branch omonimo). Da "Appunti Implementazione" §3.
(1) **Export PDF VETTORIALE**: `svg2pdf.umd.min.js` v2.2.4 vendored (MIT, 84KB, registra
`jsPDF.API.svg()` su jsPDF 2.5.1); `exportPDF` (mappai-d3-render.js) clona `#map-svg`
con CSS inline (`_svgCloneWithStyles`, condiviso con exportSVG), azzera la transform di
zoom e usa `getBBox()` del g → PDF con l'INTERA mappa come vettori, zero overlay UI per
costruzione. Percorso raster preservato come `_exportPDFRaster()` = fallback automatico
su errore (toast `tst_pdf_vector_fallback`). Il vettoriale funziona anche su iPad
(niente capturePage). (2) **Sintesi "Tutta la mappa"** (mappai-branch-synthesis.js):
opzione `__ALL__` nel modale; ≤30 nodi = chiamata unica, altrimenti map-reduce —
`_synthesizeOnce()` per ramo (budget invariato, overlay progresso i/n, ramo fallito =
segnaposto non bloccante) + chiamata panoramica finale (prompt inline, `mapLangNote()`);
citazioni numerate PER SEZIONE (rinumerazione globale = fragile, evitata di proposito);
render modale+stampa multi-sezione via `_wholeBodyHtml`. (3) **Keyword foglie**
(mappai-print-dossier.js): `_cleanKeywords()` unica per AI e fallback (dedupe, via
token del titolo, via <3 char, cap 7 — smoke-tested in Node); item batch marcati `leaf`,
prompt con regola foglie (concetti SOLO dalla desc; desc <15 parole → `[]`);
`_fallbackKeywords` ritorna `[]` su foglie povere (card col solo titolo, niente rumore).
i18n: `bs_*`/`tst_pdf_vector_*` in EN (fallback IT inline). Suite **301/301** ✅.
⚠️ Verifica Electron pendente: T004 (PDF), T009 (sintesi), T013 (keyword).

### 🧹 FATTO (11/7/26 sera): menu hub + tooltip hover (richiesta utente anti-sovraccarico)
I docenti poco esperti si spaventano davanti a menu lunghi e testi grigi esplicativi.
(1) **Menu azioni rapide asciugato a 4 hub**: Studio attivo · **Materiali di studio** ·
**Graph manager** · Knowledge Garden (+ Sincronizza Vault dinamico, Annulla, Home).
(2) Nuovo `public/js/mappai-menu-hubs.js` (caricato dopo mappai-active-study.js):
`window.openStudyMaterialsModal()` (sezioni: Stampati = Foglio nodi/Sintesi ramo/
Dossier/Timeline; JIGSAW = Esporta/Ricomponi/Lacune) e `window.openGraphManagerModal()`
(sezioni: Vault = esporta/importa; File JSON = importa/unisci/+dungeon se kill-switch;
Appunti = esporta MD). Gli input file (`menu-import-json`, `sidebar-merge`,
`menu-import-floorplan`) restano NASCOSTI nel menu: i modali li attivano via `click()`.
(3) **Tooltip hover globali** (`window.MappAITips`, delega su document): qualunque
elemento con `data-tip="..."` mostra il popup — vale per tutti i modali presenti e
futuri. Card PULITE (icona+titolo); il testo grigio resta SOLO come motivo delle card
`disabled` (un elemento disabled non emette eventi mouse → il tooltip non uscirebbe).
Launcher Studio attivo aggiornato allo stesso pattern (hint → tooltip) + numerazione
8. Cloze / 9. Palazzo. **Gate JIGSAW preservato**: `_syncStudentUI` di mappai-jigsaw.js
agiva sui bottoni menu rimossi (ora no-op innocuo); il gate vive nei modali hub via
`mappai_jigsaw_mode` (studente: niente Importa JSON né sezione JIGSAW).
i18n: `ui_materials_hub`/`tt_materials_hub`/`ui_graph_manager`/`tt_graph_manager` in
ENTRAMBI i dizionari; `mh_*`/`gm_*`/`hub_fn_missing` solo EN (regola 13). Suite 301/301 ✅.
⚠️ Da verificare in Electron vivo (T011-bis): 2 hub aprono i modali, ogni card apre il
flusso di prima, tooltip leggibili, JIGSAW mode nasconde le card docente.

### 🎨 FATTO (11/7/26 sera): emoji → icone Lucide SVG nei modali Studio + hub
Richiesta utente ("metti solo icone lucide ovunque", scope confermato = modali Studio+hub).
Tutte le emoji dei titoli/header/bottoni convertite in `<i data-lucide>` SVG; emoji
decorative (🎉/💪) rimosse. `buildModal` (mappai-active-study.js) accetta `opts.icon`
e chiama SEMPRE `safeCreateIcons` dopo l'append → ogni lucide inline di titolo/body si
renderizza. `buildHubModal` (mappai-menu-hubs.js) idem col titolo a icona. File toccati
+ mapping: active-study (puzzle launcher, lightbulb Suggerimento, volume-2 TTS, check/x
Sì-No, rotate-cw Da rivedere, trending-up Crescita), cloze (pencil-line), celeration
(trending-up), study-path (compass/play/rotate-cw/circle-check/lock), palace (landmark/
door-open/check/x), mastery-view (target), effort-view (flame). Bottoni flottanti legacy
`b.textContent=emoji` → `b.innerHTML='<i data-lucide>'` + flex-center + safeCreateIcons.
Chiave EN `tst_as_correct` ripulita ("✓ Correct!" → "Correct!"). Verificato in browser:
tutti e 19 i nomi icona esistono in lucide.min.js e rendono `<svg>`; scan emoji residue
= 0 nei 7 file. Suite 301/301 ✅. Regola nuova: **nei modali usare SEMPRE `<i data-lucide>`
+ safeCreateIcons, MAI emoji nei titoli/bottoni.**

### 🌱 PIVOT (10/7/26 sera): Memory Dungeon → Knowledge Garden — Fasi 0-5 IMPLEMENTATE
Decisione utente: dungeon troppo oneroso per i docenti → l'editor diventa ambiente
creativo bonus. **Giardino espositivo di classe**: studenti entrano dal browser via QR
(server LAN sul PC docente), rivendicano una parcella disegnata dal docente (pennello 🌱
nell'editor, maschere anche non rettangolari), costruiscono (texture, muri ≤10, rilievo,
oggetti 3D) e consegnano con **targhetta obbligatoria** (concetto della mappa mentale).
Fonte di verità: `docs/knowledge-garden.md`. Piano: `~/.claude/plans/devo-chiudere-il-progetto-radiant-wirth.md`.
- **Core puro**: `public/js/mappai-garden-core.js` (UMD — maschere parcella, validatePlots,
  validateTarghetta/Submission, applyClaim, mergeGarden, wallVisibility cutaway) +
  `tests/garden-core.test.js` (38) e `tests/garden-server.test.js` (9) → suite **297/297** ✅.
- **Editor**: pennello 🌱 Parcella (rotondo/quadrato, overlay colorato, export `plots`
  in mapJSON, avvisi sovrapposizione/area; il resize ora conserva anche `mat`).
  Bump cache `editor.js?v=e7-plots`.
- **Studente**: `tools/voxel-proto/garden.{html,js}` (fork di proto.js, proto INTATTO):
  intro full-screen, bordi parcella (verde/ambra/blu/menta), **muri cutaway** allo snap
  Q/E (wallVisibility pura), creator mode con guard maschera + toast, bozza autosalvata,
  cartelli 🪧 cliccabili, riconsegna permessa.
  Dev mode: `garden.html?map=maps/giardino_voxel.json&dev=1&plot=5`.
- **Server LAN**: `garden-server.js` (repo root, Node http puro, static allowlist rigida,
  API session/claim/plot/status/release, token nel QR + adminToken, crash-safe: riprende
  da disco con lo stesso token). Archivio `~/Documents/MappAI - Knowledge Garden/<slug>/`
  (session.json, plots/*.json, merged.json riapribile per sempre).
- **Docente**: Studio → card 🌱 (template da editor/file, avvia/riprendi sessione, QR
  anche a schermo intero per proiettore, dashboard polling 3s, apri giardino/cartella).
  IPC `garden-start/stop-session`, `garden-session-status`, `garden-open-folder` in
  main.js + preload. QR vendored `public/js/vendor/qrcode-generator.js` (MIT).
- **Dungeon NASCOSTO, codice+test intatti**: voce menu import dietro
  `mappai_dungeon_visible` (default nascosta), launcher card → "Knowledge Garden",
  studio.html → "MappAI Studio". Launcher 🎮 era già OFF di default.
- ✅ Verificato in browser: editor (pennello, export, persistenza), giardino end-to-end
  CONTRO SERVER REALE (redirect QR-URL → claim → costruzione → consegna → file su disco →
  secondo device vede la mostra unita). ✅ Testato in Electron vivo da Giacomo (11/7/26):
  card 🌱 → sessione :8765 → QR → claim/consegna da device studente OK.
- **FASE 6 (11/7/26): editor studente device-adaptive** (richiesta utente post-test).
  PC = **editor full edition** servito dal LAN server in modalità studente
  (`editor.html?s=<token>&plot=pNN`): boot da /api/session — **CROP della sola
  parcella** (bbox maschera → mini-mappa locale, fuori maschera = void, palette
  verde giardino + template, camera addosso; coordinate riconvertite in globale
  con STUDENT.off in bozza/consegna), guard maschera in paintAt (+bump per-cella),
  muri slider fino a 10,
  UI gated (no Colori/Luci/Vuoto/Parcella/resize/save-vault), «📮 Consegna» con
  targhetta, prop propri marcati `_student`, bozza CONDIVISA col giardino (stessa
  chiave `garden_draft::token::plot`). Telefono (`IS_MOBILE`, override `?mobile=1`) =
  solo «🧊 Crea asset voxel» + «🎨 Crea asset 2D» (→ editor #voxel/#pixel) +
  piazzamento + consegna. **Librerie custom studente**: `namespacePlotLibs` (core,
  puro) rinomina texture/materiali nuovi in `pNN.*`, riscrive i riferimenti
  (cells.mat, cubes.m/f, faces), azzera i tag; il server valida (cap 24+24, 64KB/tex,
  `lib-not-namespaced`) e li unisce alle librerie di sessione. Allowlist statica
  +mappai-dungeon-core.js; HTML serviti no-cache. FIX: bottone menu MappAI
  "Knowledge Garden" ora apre la finestra Studio (`openKnowledgeGardenHub` →
  `launcherChoice('studio')`, definito inline in index.html; chiave EN
  `tst_kg_electron`). Suite **301/301** ✅. E2E verificato contro server reale
  (claim → editor studente → muro alt9 da bozza → consegna → merged; mobile flow
  con ?mobile=1; #voxel diretto). ⚠️ Resta: test 2 dispositivi Wi-Fi reale.
- **FIX movimento (11/7/26)**: (1) **blocco contro i muri risolto** — la collisione
  era a 4 punti (`stepKind`): il campione perpendicolare restava nel muro → blocked
  su entrambi gli assi → incastro. Nuovo `axisKind` DIREZIONALE (solo il fronte +
  2 spigoli arretrati nella direzione del movimento) → scivolamento lungo i muri.
  (2) **Salto con Spacebar** (`tryJump` → arco `jumpT`); durante il volo (`airborne`)
  il tetto di salita passa da STEP_UP_WALK a STEP_UP_JUMP → si superano rialzi
  1.0-1.6 saltando. Solo in garden.js (proto.js invariato). Verificato in browser
  (scivola 4u lungo muro, spacebar avvia salto, gradino 1.2 walk in aria).
- Prossimo: garden template curati (Giacomo) in `tools/voxel-proto/maps/garden_*.json`.

### ✅ FATTO (10/7/26): 001-menu-reorg — riorganizzazione menu (spec-kit) + addendum
Prima feature via **spec-kit** (`specs/001-menu-reorg/`, branch omonimo). Riordino UI
puro, zero cambi di comportamento. (1) TUTTI i flottanti del bordo destro spostati nel
launcher **Studio attivo**, ora modale **landscape 980px a due colonne**
(`mappai-active-study.js`: `buildModal` con `opts.maxWidth`; sinistra "Modalità di
studio", destra "Viste ed esercizi rapidi" — Cloze avvia, Heat map 🎯 e Mappa lavoro 🔥
toggle con stato — + "Strumenti" — Cosa studiare ora 🧭, Palazzo della Memoria 🏛️,
Progressi 📈). Colonna flottante destra VUOTA di default. (2) Nuova sezione **"Output
materiali di studio"** nel menu azioni rapide (`index.html`): Foglio nodi · Sintesi di
ramo · Stampa dossier · Timeline · Jigsaw×3. (3) Flottante **Memory Dungeon 🎮 rimosso**
di default (ingresso futuro: hub Knowledge Garden). (4) Nuovo bottone **"Knowledge
Garden"** (sprout) nel menu azioni rapide sotto Studio attivo — contratto: chiama
`window.openKnowledgeGardenHub()` se definito (hub in sviluppo su altro filone),
altrimenti toast `tst_kg_soon`. Kill-switch `mappai_legacy_float_btns='1'` ripristina
TUTTI e 7 i flottanti alle posizioni storiche (20/84/148/212/276/340/404). i18n
bilingue (`ui_output_materials`, `ui_knowledge_garden`, `tt_knowledge_garden` in
entrambi i dizionari; `as_*`/`tst_kg_soon` via `window.t`). Suite **250/250** ✅.
**FIX CRITICO (stessa sera)**: le modalità di Studio attivo che smontano la mappa
(1/2/5/7) + "Torna alla Home" perdevano la gerarchia PER SEMPRE — `renderGraph` è
monkey-patchato per salvare, quindi lo stato smontato finiva in localStorage già
durante la sessione; il reload uccideva lo snapshot (solo in memoria). Fix a 3 strati:
guardia in `saveCurrentProject` (mai persistere con sessione attiva),
`ActiveStudy.emergencyExit()` (chiusura sincrona: punteggio + ripristino snapshot,
zero modali), chiamata in `backToLanding`/`importGraph`/`loadMapVault`/`directLoadVault`.
Inoltre Cloze e Palazzo spostati tra le "Modalità di studio" nel launcher (richiesta utente).
⚠️ Non ancora testato in Electron vivo: debug-run manuale `npm start`
(quickstart.md + T025/T030 della feature).

### ✅ FATTO (7/7/26): §21 movimento quota-aware in-app — gradini/salto/discesa cappata
Design + implementazione completa Q1→Q4 in `MEMORY_DUNGEON_DESIGN.md` §21 (stato: §21.9).
Regole (decisioni utente §21.8): salita walk ≤0.9 / jump ≤1.6 (arco 0.32s) / oltre
BLOCCATO; **discesa cappata a 1.6 (DQ0** — diverge dal proto: niente caduta libera) →
movimento SIMMETRICO → softlock impossibile per costruzione; mob territoriali |Δq|≤0.9
nei due versi (DQ1, non ingaggiano attraverso un dislivello); no fall damage (DQ2).
- **Core**: `planToGrid`→`quota`+`hasQuota`; `stepKindGrid` walk/jump/fall/blocked;
  `findPathQuota` (BFS — rot.js A* NON basta: callback solo (x,y)); `reachableCells`;
  `_reachableFrom`+flood-fill `worldZones` quota-aware (rupe >1.6 = muro, divide zone);
  `validatePlan` warning `slot-unreachable`. +9 test `tests/dungeon-quota.test.js`.
- **Runtime**: `DUN.quota` dai loader piano/mondo (altri loader → null = piatto);
  kill-switch `mappai_dungeon_quota='0'`; `DUN.path.wait` per-passo (jump 320ms) +
  `jumpFx`/`fallFx`; `_mobStepOk`/`_mobEngage`; staleness solo su celle raggiungibili;
  `_jumpBump` saltello skin 2D; chiave i18n `dg_cliff` in en_translations.
- **Voxel**: terreno a quota reale, entità a y=quota (`st.gy`), lerp y eroe + arco
  mezzo-seno, camera/lanterna seguono il terreno (senza bump).
- **Authoring**: `autoSlots` editor quota-aware (bump `editor.js?v=e6-quota`);
  contratto §2/§4 aggiornati. Esempio test manuale:
  `docs/game-design/esempi/piano-1-rilievo.json` (valle/terrazza/gradino-salto/rampa,
  validato col core). Suite **250/250** ✅.
- **Batch fix post-test Electron (stessa sera, dettagli §21.9)**: canvas voxel
  dimensionato sul CONTENITORE `#game` (+ResizeObserver — era il bug "non giocabile
  se non fullscreen"); **WASD/frecce+SPAZIO SCREEN-RELATIVE con HOLD**
  (`_screenToGrid` da `MappAIDungeonVoxel.yaw()`: W=su-schermo, in iso = diagonale
  di griglia, stessa formula del proto; `DUN.held`+`_keyDrive()` nel `_dunTick` =
  passi continui finché premuto, non un passo per keydown; salto §21); **zoom
  rotellina** (st.half 4..18); **sprite LoL
  nella skin voxel** (playerSheet outfit, scheletro/bat, boss guardian, Sapienti
  per-file, flip eroe — parità visiva 2D↔3D, frame verificati in preview); **NPC
  giardino animati anche in voxel** (la skin ora segue x/y della logica). Nota: erano
  gap proto↔app documentati (§19), non regressioni — unico bug vero il canvas.

### 📐 DESIGN (7/7/26): §20 mappa-mondo — open world a zone (P2, decisioni PRESE)
Scritto `MEMORY_DUNGEON_DESIGN.md` **§20**: mappa unica grande, zone = macro-aree L1
(metodo dei loci giocabile, convergenza con Palazzo §19 F3 e defrag §17), GATE di
confine con guardiani, zone detection per flood-fill + binding soft `branchHint`,
validatore BFS-con-porte, valvole ADHD (minimappa a zone, bussola, fog per zona).
Schema bozza `mappai-dungeon-world@1`. **Decisioni fissate con l'utente (§20.9)**:
D1 docente assegna zone↔rami (fallback per capienza) · D2 gate default = coverage 0.6
+ quiz 2 domande · D4 file separato `Memory Dungeon/mondo.json` · D7 giardino = zona
di spawn. Default non obiettati: D3 ordine dalla topologia, D5 cap 64×64, D6 solo
voxel. Fasi W1-W4 in §20.8.
**✅ W1 FATTA (7/7/26)**: contratto §11 (`mondo.json`, schema `mappai-dungeon-world@1`,
celle/props IDENTICI a §2 → Pianta e materiali funzionano già) + logica pura in
`mappai-dungeon-core.js`: `worldZones` (flood-fill deterministico, i gate tagliano;
anchor match; conteggi per zona), `bindZones` (D1: hint fuzzy poi capienza),
`validateWorld` (BFS-con-porte: `gate-not-boundary`, `zone-unreachable`, coverage
per ZONA con severità ruleset, `gate-req-invalid` → default D2, `zone-no-memory`
con zona spawn esente per D7). +17 test in `tests/dungeon-world.test.js` → suite
**239/239** ✅.
**✅ W2 FATTA (7/7/26)**: runtime mondo — loader legge `mondo.json`; `_loadWorld`
(zone→rami L1 via `_branchGroups`+`bindZones`; memorie del ramo → slot della zona,
staleness IN-zona; gate chiusi = celle bloccate; gatekeeper = boss; guard SOLO-voxel
D6 con fallback ai piani + toast; kill-switch `mappai_world_mode`); gate runtime
(click vicino → `checkGateReq` puro (coverage/mastery, default D2) → quiz guardiano
`_runQuiz` con pool dal diario del ramo → apertura = cella sbloccata + `worldRev++`
→ skin voxel ricostruisce, porta 🚪 sparisce); minimappa a ZONE in alto a destra
(bolle colore-ramo, scure se irraggiungibili, archi gate verdi/tratteggiati, anello
zona corrente). +19 test core totali; suite **241/241** ✅. Esempio validato:
`docs/game-design/esempi/mondo.json` (giardino-hub + 2 zone) — primo test manuale:
copiarlo in `<vault>/Memory Dungeon/` e aprire il dungeon con skin voxel.
⚠️ Non testato in Electron vivo. Prossimo: W3 authoring (gate nella Pianta,
requisiti per ramo nello Studio, pannello zone editor).

### ✅ FATTO (7/7/26): editor rilievo/texture pavimento + movimento a dislivelli (proto)
Tutto in `tools/voxel-proto` (editor + proto), verificato in preview. Suite 241/241 ✅.
- **#1 texture/tag diretta sul pavimento**: select «…oppure texture/tag» nella scheda
  Mappa → dipingendo pavimento crea al volo un materiale `auto:<ref>` (top=ref) e lo
  assegna a `cell.mat`. Il materiale pennello salvato resta l'alternativa. Bump cache
  `editor.js?v=e5-bump`.
- **#2 pennello ⛰ Rilievo (bump)**: alza/abbassa la quota dei pavimenti nel raggio con
  sfumatura coseno ai bordi (colline a pendii progressivi); intensità 0.05-0.5, raggio
  1-8, su/giù; clamp ±2; solo su celle floor. Verificato: profilo simmetrico 0.03→0.9→0.03.
- **#3 dislivelli asimmetrici nel PROTO** (`stepKind` sostituisce `walkableFrom` simmetrico):
  salita camminando ≤ `STEP_UP_WALK` 0.9, col salto ≤ `STEP_UP_JUMP` 1.6 (arco mezzo-seno
  0.32s in animate), oltre bloccato; discesa illimitata (caduta dai bordi); mai in
  acqua/lava/vuoto (restano `blocca`). `findPath` aggiornato (salita>jump bloccata,
  discesa libera). Verificato: 0.5→walk, 1.0→jump, 2.0→blocked, pit→walk, acqua/void→blocked.
  ⚠️ SOLO proto (movimento continuo). L'app usa griglia piatta 0/1: portare i dislivelli
  in-app è lavoro F2 separato (la quota lì è solo estetica della skin voxel).

### ✅ FATTO (7/7/26): P1 — editor Pianta (blockout 2D → mappa 3D)
`tools/voxel-proto/pianta.html` (self-contained, niente three). ZERO tocchi al contratto:
genera `cells` standard; lava = `{biome:'floor', quota<0, blocca:true, mat:'lava'}` (nessun
bioma nuovo — la veste il sistema materiali; materiale lava base auto-creato se assente).
- Pennelli quadrato/rotondo (1-11), pavimento/nero/muro interno (altezza per-cella);
  nero → acqua | lava | vuoto; slider dislivello (quota, con jitter deterministico)
- **Contorno offset** (toggle + altezza): muri auto attorno al pavimento (adiacenza 8)
- Strumenti: **istmo** (linea con larghezza pennello), timbri stanza ■/● (perimetro muro +
  interno pavimento), simmetria x/y/4-vie, coste organiche (1 passo CA), undo (Ctrl+Z,
  stack 40), import PNG bianco/nero, anteprima 3D iso live
- Sketch persistito (`voxelproto_pianta`) → si ritocca e si ri-applica (props conservati)
- Aggancio: Studio «Nuova mappa» terza tela «✏️ Pianta» (ctx piano passa attraverso);
  link ✏️ nell'header editor
- Verificato in preview: isole+istmo+timbro+coste→Applica→editor 3D (102 floor/90 wall/
  832 water, muri offset corretti), persistenza sketch, simmetria 4 vie, zero errori.
  Suite 222/222 ✅. P2 (design mappa-mondo: zone=rami L1, gate con requisito) = da discutere.

### ✅ FATTO (7/7/26): materiali & texture — editor Materiali, contratto §2-quater
I 3 tocchi al contratto approvati dall'utente, più la filiera che li usa (VAULT_DUNGEON_
MAPS_CONTRACT.md §1/§2/§2-bis/§2-quater aggiornati):
- **Contratto**: `Memory Dungeon/materiali.json` (schema `mappai-dungeon-materials@1`:
  textures {png dataURL, tags} + materials {color, faces{top/side/bottom/all}, tags});
  celle con `mat` opzionale; cubi props con `m` (materiale) e `f` (override per faccia).
  Riferimenti: "nome-texture" diretta o `"#tag"` = random DETERMINISTICO (seed dalla
  posizione → zero sfarfallio tra rebuild).
- **Modulo condiviso** `tools/voxel-proto/voxel-materials.js` (editor+proto): resolve
  riferimenti, cache texture NearestFilter, cubi a 6 materiali, QuadBatcher (1 draw
  call per texture sul terreno: top pavimenti + top/lati esposti muri; acqua esclusa v1).
- **Editor**: scheda MATERIALI (form ricetta + anteprima cubo iso con texture reali +
  liste materiali/texture); Pixel → «Salva come texture» (nome+tag); pennelli mappa con
  select materiale; costruttore voxel con select «materiale cubi nuovi» + strumento
  «Texture faccia» (click sulla faccia = applica texture/#tag, via faceKeyFromNormal).
  Bump cache `editor.js?v=e3-materials`.
- **Vault/condivisione**: IPC `save-dungeon-materials`; `load-dungeon-floors` ritorna
  `materials`; lo Studio fa merge nel localStorage all'apertura vault/file; «Salva nel
  vault» dell'editor scrive anche materiali.json; il pacchetto classe include
  `materials` e l'import in MappAI lo scrive nel vault dello studente.
- Verificato in preview (texture generate + mappa 10×10): pavimento erba con varietà
  per-tile, muri roccia, cubo-materiale, anteprima "blocco erba" (top erba/lati roccia),
  resolve deterministico (stessa cella→stessa texture), zero errori console. Suite 222/222 ✅.
- ⚠️ La skin voxel dell'app NON renderizza ancora materiali (arriva con la F2, come i props).

### ✅ FATTO (7/7/26): asset v3 — 4 regole, import .vox, WASD pan, uscita segreta
Contratto aggiornato (props: `yOff/billboard/scale/rot/walkable/light` — vedi
VAULT_DUNGEON_MAPS_CONTRACT.md §2 e README voxel-proto; `surface` resta SOLO in libreria).
- **4 regole**: piazzamento mai su muro/vuoto; per-asset `surface` floor/water/any
  (default floor — alberi/item solo su pavimento); checkbox billboard (default: ancorato
  al mondo, ruota con la mappa); slider `yOff` altezza dal suolo (default 0; >0 = fluttua
  con bob sinusoidale). Slot memoria/personaggi: già coperti dal validatore (`slot-blocked`).
- **Idee implementate**: thumbnail isometriche in libreria + anteprima asset in scheda
  Mappa; scala (0.5-2) e rotazione (0/90/180/270) per-istanza; luce agganciata all'asset
  (point light + sfarfallio, statica nel proto); `walkable` (footprint 1×1, multi-cella
  = futuro); tag + filtro libreria; varianti hue-shift (🎨); libreria export/import file
  (`mappai-voxel-assets@1`).
- **Import .vox (MagicaVoxel)**: parser chunk SIZE/XYZI/RGBA, assi Z-up→Y-up, palette
  default approssimata se manca RGBA, cap 3000 (proponi riduzione 2×) / 10000 (rifiuto),
  nota licenze in UI. Carica nel costruttore → si impostano proprietà → Salva.
- **Editor**: WASD = pan della vista relativo all'inquadratura (camera non più ancorata);
  guard input su tutti i tasti (Q/E compresi — prima digitare 'q' nel nome ruotava).
- **Uscita segreta**: 5 click nell'angolo alto-sinistra (56px, entro 3s) su landing
  MappAI E Studio → IPC `launcher-return` → torna alla schermata di scelta.
- Verificato in preview: parser .vox su file sintetico (palette default ordine spec ✓),
  regola "solo acqua" rifiutata su pavimento ✓, istanza con scale/rot ✓, thumbnails ✓,
  WASD ✓, hue-shift rosso→verde ✓. Suite 222/222 ✅. Bump cache: `editor.js?v=e2-assets`.

### ✅ FATTO (7/7/26): landing Memory Dungeon Studio — 9 punti + flussi base
Fonte di verità aggiornata: VAULT_DUNGEON_MAPS_CONTRACT.md (§2-bis bundle, §9.6 Studio).
`tools/voxel-proto/studio.html` = entry della finestra Studio (main.js, preload agganciato).
- **Nuova mappa**: da progetto recente (localStorage condiviso file://) o vault (IPC) →
  requisiti estratti (memorie per livello) → livello/kind/tela → editor
- **Apri vault**: menu piani con anteprime isometriche + badge validazione (✓/⚠/✗),
  CTA "Crea" sui livelli procedurali, form regole docente (IPC `save-dungeon-ruleset`)
- **Riprendi** (autosave), **Apri file** (piano o bundle + vault destinazione),
  **Solo asset** (`#voxel`/`#pixel`), **Genera bozza** (digger seedato),
  **Pacchetto classe** (IPC `export-dungeon-bundle` + dialog)
- **Editor**: barra vault da `voxelproto_plan_ctx`, «Salva nel vault» con SLOT AUTOMATICI
  (spawn/uscita BFS/memorie farthest-point) se non disegnati, validatePlan §4 prima
  della scrittura. ⚠️ `editor.js` caricato con `?v=` anti-cache: bump a ogni modifica.
- **MappAI**: `importFloorPlan` accetta anche `mappai-dungeon-bundle@1` (`_importBundle`:
  valida ogni piano, conferma unica, riepilogo sovrascritture)
- Verificato in browser: estrazione requisiti, auto-slot (piano 16×16 VALIDO, warning
  minSpacing correttamente rilassato), bozza, hash-tab, fallback senza electronAPI.
  Parti vault/IPC non testate in Electron vivo. Suite 222/222 ✅.

### ✅ FATTO (7/7/26): launcher all'avvio — scelta MappAI / Memory Dungeon Studio
All'avvio (`npm start` E build pacchettizzata: richiesta utente, i docenti devono avere
lo Studio) si apre `public/launcher.html` (640×420, tasti 1/2/Invio) → IPC
`launcher-choice` → MappAI (`createWindow`) o **Studio** (`createStudioWindow`:
`tools/voxel-proto/editor.html` in finestra Electron 1440×900, nessun preload).
- Card MappAI in stile landing (MappAI_icon.png + titolo Space Mono font-black chiaro);
  card Studio con illustrazione voxel isometrica disegnata a canvas (seedata,
  palette della skin: pietra/acqua/tile ambra+alone lanterna) + titolo pixel-style.
- **three.js r164 VENDORED** in `public/js/vendor/three-r164.module.min.js` (674KB,
  jsdelivr scaricato una volta): import map RELATIVI in editor.html e index.html del
  proto → editor/proto/Studio funzionano OFFLINE. Verificato: network tab senza CDN.
- electron-builder senza whitelist `files` → `tools/voxel-proto` finisce nel pacchetto ✓
- ⚠️ Studio = editor voxel attuale: salvataggi ancora in localStorage; export contratto
  piano-N + slot didattici = piano E1, non ancora fatto.
- `launcherChoice` esposto in preload.js. Verificato in browser (screenshot launcher,
  editor con three locale, zero errori); non testato in Electron vivo.

### ✅ FATTO (7/7/26): Memory Dungeon — sprite PNG animati + skin voxel DEFAULT (§19 F2)
Su richiesta utente ("d'ora in poi three.js e basta"), scelta: portare prima gli sprite
del proto, poi girare il default. Fonte: `MEMORY_DUNGEON_DESIGN.md` §19 "Stato implementazione".
- `_skin()` ora ritorna **`'voxel'`** di default (era `'lol'`). Fallback SICURO: se THREE
  assente o `frame()` fallisce → `_dunRenderLoL()` (2D), mai il vecchio renderer ASCII.
  Setter `MappAIGames.skin('voxel'|'lol'|'fantastic')`.
- `mappai-dungeon-voxel.js`: PERSONAGGI = sprite PNG animati dai fogli `rogue8x8`
  (eroe Girl-Melee walk/idle, mob OrcSheet, boss gatekeeper 4-frame, NPC statici variati).
  Frame via UV `offset`/`repeat` (clone del foglio), animati su clock globale in `V.frame`.
  LANDMARK di studio (libri/scale/condotto/server/portale) restano emoji self-lit.
  Async con placeholder emoji → PNG mancante = emoji resta (fallback).
- ⚠️ Giardino curato `_gmap` reso solo in 'lol'; in voxel → layout procedurale seedato.
  Duelli F/J senza balloon in voxel (F2 world-space da fare). Non testato in Electron vivo
  (licensing blocca browser); verificato con harness three-r128 (6/6 sprite, crop ok).
- **Parità visiva col proto** (7/7/26, da feedback screenshot utente): Q/E ruota camera 90°
  (lerp; supera lo yaw-fisso §19.4), 1 tile = SUB×SUB mini-voxel adattivo (3/2/1 per
  1200/3000/oltre celle) con jitter quota+colore, muri a colonne variabili, acqua incassata,
  ombre BasicShadowMap + customDepthMaterial sugli sprite (segue il frame anim), taglie in
  rapporto proto (eroe 0.78, mob 0.62, boss 0.95, landmark 0.62-0.85), reset tinta visitato
  al passaggio a luce piena. Dettagli: MEMORY_DUNGEON_DESIGN.md §19.

### ✅ FATTO (6/7/26): vault ↔ Memory Dungeon — cartella default, nome-libero, import validato
Fonte di verità: `docs/game-design/VAULT_DUNGEON_MAPS_CONTRACT.md` (§1/§9/§10 aggiornati).
- Cartella vault RINOMINATA `Dungeon/` → **`Memory Dungeon/`** (nessun vault legacy: mai rilasciata)
- `save-map-vault` (main.js) crea `Memory Dungeon/piani/` + `LEGGIMI.md` di default a ogni salvataggio
- **Loader nome-libero** (`load-dungeon-floors`): piano legato dal nome `piano-N.json` SE presente,
  altrimenti dal campo `"id"` interno → file ricevuti da docenti/compagni si droppano senza rinominare;
  conflitto stesso piano → vince mtime più recente + warning
- **`validatePlan(plan, ruleset, levelNodeCount)`** in `mappai-dungeon-core.js` (contratto §4, pura,
  UMD): giocabilità sempre error (spawn/scale-BFS/gatekeeper/slot-su-muro), pedagogia con severità
  da ruleset; minSpacing in BLOCCHI con rilassamento a warning se insoddisfabile; ultimo piano
  dedotto dagli slot (gatekeeper presente = finale). +15 test → suite **222/222** ✅
- **Import in-app**: menu azioni → «Importa piano Dungeon» (`#menu-import-floorplan`, i18n nei 2
  dizionari) → `MappAIGames.importFloorPlan`: schema+id+level check → validatePlan coi nodi correnti
  → conferma sovrascrittura → IPC `save-dungeon-floor` scrive `piano-N.json` normalizzato
- ⚠️ Non testato nell'app Electron viva (browser bloccato dal licensing; unit test + DOM check ok).
  Primo test manuale: importare `docs/game-design/esempi/piano-1.json` da un vault aperto.

### ✅ FATTO (6/7/26 notte): Giardino per-mappa + Sapienti con personalità
Vincolo: `docs/game-design/VAULT_DUNGEON_MAPS_CONTRACT.md` è fonte di verità, no slot npc in
v1 → personalità e giardino sono RUNTIME (zero campi contratto). Dettagli in
`MEMORY_DUNGEON_DESIGN.md` §19 "Giardino per-mappa". In sintesi:
- Movimento + stop-chat-ripresa dei Sapienti già in `mappai-npc-behavior.js`: ora
  `mappai_npc_garden_enabled` **default ON** (kill-switch '0').
- Personalità: catalogo `PERSONALITIES` (5 archetipi) + `pickPersonality(seed)` in
  npc-behavior.js; detta raggio/cadenza/`tone`. `mkBehavior` 5° arg `persona` (retrocompat).
  Seed = rootNodeLabel+nodeId → carattere stabile per la classe. `tone` usato nel prompt
  `NPC_NARRATOR` (prima hardcodato 'misterioso e gentile').
- Giardino seedato per-mappa in `_loadGarden` (flag `mappai_garden_seeded` default ON):
  stesso giardino a ogni visita della stessa mappa, diverso tra mappe (loci).
- Numero Sapienti: uno per macro-area L1 (non più fisso a 4), fino a
  `mappai_garden_sapienti_max` (default 8, clamp 1..12); sprite ciclato; loader accetta
  slot `sapiente-*` generici per mappe curate. Suite 222/222 ✅.

### ✅ F0+F1 FATTI (6/7/26 notte): §19 — voxel 3D, prime due fasi
F0 nel proto (buio+lanterna, condotto-ponte, boot=luce, entità §19.2 — validato in browser).
F1 nell'app: skin `mappai_dungeon_skin='voxel'` in `mappai-dungeon-voxel.js` (three r128
vendored), hook in games.js, auto-fallback 2D su errore, sfide §17 ancora modali.
Mapgen bonificato (path BERT → repo-relativi). Limite F1: duelli F/J senza balloon in
voxel → usare modalità studio. Suite 188/188 ✅. Prossime: F2 world-space, F3 default.
Dettagli: `MEMORY_DUNGEON_DESIGN.md` §19 "Stato implementazione".

### 📐 DESIGN (6/7/26 notte): §19 — ambiente voxel 3D × studio world-space
Nuova direzione grafica in `tools/voxel-proto` (volumi flat + sprite billboard, griglia
logica INTATTA). Design completo in `MEMORY_DUNGEON_DESIGN.md` §19, **in attesa di conferma
prima di codificare**. Decisioni utente: design-first · fog = buio+lanterna (boot = luce
globale) · sfide §17 world-space (verbo unificante "porta-e-deposita"; input digitati
restano DOM come terminali CRT diegetici) · mapgen ibrido (stanze speciali curate,
piani normali procedurali runtime). Contratto entità v1 nel §19.2. Migrazione in 4 fasi
(F0 proto → F1 terza skin 'voxel' → F2 world-space → F3 default). ⚠️ Debito: script
`tools/mapgen` puntano hardcoded al repo MappAI BERT — da portare in casa prima di F1.

### ✅ COMPLETATO (6/7/26 sera): Memory Dungeon §17 — le 7 modalità di Studio Attivo nel dungeon
Implementata TUTTA la sezione §17 di `docs/game-design/MEMORY_DUNGEON_DESIGN.md` (tabella
"Stato implementazione" in fondo al doc con flag e dettagli). In sintesi:
- **⚡ Condotto** (modo 6): cross-link con verbo → scegli la famiglia del connettore (2 tentativi,
  conta il 1°); il condotto resta fast-travel tra piani visitati + "visione" dell'altro capo
- **🖥 Server di boot** (modo 7): riavvia le macchine nell'ordine della catena; LCS; successo =
  nebbia del piano dissolta
- **🎭 Mimic + 📁 archivio al gate** (modo 5): memoria di un altro piano; voce mal archiviata
  (intruso lessicalmente distante via `pickMisfiled`)
- **🗂 Indice corrotto** (modo 3): al gate riassegni i titoli alle TUE sintesi (fuzzy opzionale)
- **▁ Unit corrotta/cloze** (modo 4): nodi già incontrati → riparazione a memoria (hint ladder);
  anti-pappagallo nella cattura standard (jaccard ≥0.8 → riformula)
- **🧩 Defrag della memoria** (modi 1-2): reveal ATTIVO post-boss — ricollochi le unit nelle
  macro-aree e la heatmap si accende man mano; skippabile
Codice: sezione «PONTE STUDIO ATTIVO ↔ DUNGEON» in `mappai-games.js`; logica pura + 10 test in
`mappai-dungeon-core.js` / `tests/dungeon-core-s17.test.js`. Attività mastery: `dungeon_verbs`,
`dungeon_seq`, `dungeon_intruso`, `dungeon_index`, `dungeon_defrag`. Kill-switch (default ON):
`mappai_dungeon_{circuits,boot,mimic,archive,cloze,defrag}='0'`. Suite: 173/173 ✅.

### ✅ COMPLETATO (6/7/26): Studio Attivo v2 — misurazione PT + revisione pedagogica
Revisione completa delle 7 modalità (lente: Handbook of Game-Based Learning) + fix implementati.
**Nuovo file**: `mappai-active-study-core.js` (helper puri UMD, testati in `tests/active-study-core.test.js`,
19 test) — caricato in index.html PRIMA di `mappai-active-study.js`.
**⚠️ Cambio semantica salvataggio**: il punteggio si salva UNA volta a fine sessione
(exit/riprova/nuovo enter), NON più a ogni Verifica — ripetere Verifica non duplica jsonl
né martella l'EWMA. Record arricchito: `metric` (completion|structure|recognition|recall|coverage),
`attempts`, `totalAvailable`, `revealed`, `reflection`, `scope`, `aiSimilarity`.
Altri interventi chiave:
- **rate per-item** (60/sec sull'item, cap 30) al posto della media di sessione stampata su ogni entry
- **scope per ramo + cap 15 item** (modi 2/3/4/6, mappe >20 nodi) — carico ADHD/DSA
- **adattività dal mastery store** (finora write-only): modo 3 sceglie i nodi più deboli,
  modo 2 sfuma i colori-scaffold con padronanza ≥0.6, modo 5 numero intrusi adattivo
- modo 1: confronto formativo AI studente-vs-originale; modo 3: toggle "Scrivi tu" (richiamo
  digitato fuzzy); modo 4: anti-pappagallo + hint ladder + autovalutazione a 3 livelli + TTS fonte;
- modo 5: intruso nel ramo lessicalmente più distante (mai random); modo 6: solo archi con verbi
  non generici, 2 tentativi (conta il primo), niente keyword-leak; modo 7: credito parziale LCS
- launcher: card "⭐ Consigliato" dalla padronanza, card disabilitate CON motivo (7 senza catena,
  6 senza verbi ricchi); hint ladder nei modi strutturali (2ª verifica: ramo; 3ª: genitore esatto)
- riflessione metacognitiva facoltativa all'uscita + bottone 📈 Crescita (celeration)
- **T7**: quiz/flashcard configurati (`study-session`) ora sul StudyBus (prima invisibili a
  padronanza/meta-analisi) + `answerMatches` fuzzy ("Roma" non matcha più "Romania")
- **T8**: intervalli SR scalati sulla padronanza EWMA (0.5×–1.5×); studyStatus/nextReview
  sincronizzati dalle sessioni di Studio Attivo
- A11y: errori con tratteggio (non solo colore), ARIA su pannelli/modali/chips
Proposte Memory Dungeon: `docs/game-design/MEMORY_DUNGEON_DESIGN.md` §17 (da discutere).

### ✅ COMPLETATO (9/6/26 sera): token budget MM multi-pass finalizzato
Run 77 nodi, 6 L1, density 1.221, 25.5% crosslinks, **truncated: 0/22** ✅
Tutte le fasi in budget e thinking preservato dove utile (Phase 4 seleziona merge intelligenti).

### ✅ Completato in questa sessione (7 giugno notte) — Item 3 "desc ricche nei modali"
Su richiesta esplicita dell'utente ("le descrizioni sono lo strumento principale che lo
studente BES/DSA usa per studiare"), priorità scelta dall'utente: **"Prima 3, poi 1+2"**.
- ✅ Flip priorità display `content||desc` → `desc||content` su TUTTE le superfici di studio
  (sidebar dettaglio, Scheda Focus, modale edit, tutor, quiz/flashcard, embedding dedup)
  — bug architetturale risolto: il modale di edit sovrascriveva `desc` ricca con `content` breve
- ✅ Fix `enrichL1Descs` con fuzzy label-matching (placeholder L1 tipo "Categoria principale: X" eliminati)
- ✅ Nuova `window.enrichThinDescs` — pass automatico post-gen, ancorato a `textParts`,
  riscrive desc <35 parole in narrazioni 50-80 parole (no hallucination, fedeltà alla fonte)
- ✅ Nuovo flag `mappai_freeze_chunks` + `window.stripChunksIfFrozen` — bypass temporaneo
  salvataggio chunk verbatim, prep per STEP 2 della riarchitettura cascata Fase 3
- ✅ Documentato in CLAUDE.md §"Modello content/desc"

### ⚠️ Recovery: index.html + style.css cancellati da auto-save (risolto)
L'auto-save delle 23:25 (`c661ebc`) aveva accidentalmente eliminato `public/index.html`
(3496 righe) e `public/css/style.css` (2727 righe) dal repo → `ERR_FILE_NOT_FOUND` all'avvio.
**Fix**: ripristinati da `d02e6dc` (auto-save 02:39, ultima versione integra), ristagiati
come `A`. App verificata funzionante (`npm start` → carica, fetch modelli Infomaniak OK).
⚠️ Verificare che il prossimo commit includa questi due file.

### Completato in questa sessione (7 giugno 2026 — calibrazione Apertus + UI JSON import)
- ✅ Bottone "Apri JSON" sulla landing page — `window.openJSONUploader()` → trigger su `#landing-import`
- ✅ Bottone "Importa JSON" nel menu floating actions (con grafo aperto) — `label for="menu-import-json"`
- ✅ `public/esempi/formato-esempio-claude.json` — mappa La Fotosintesi in formato MappAI
  (17 nodi L0-L3, 4 rami, 7 cross-link con verbi semantici) — per test import + calibrazione Claude
- ✅ `public/esempi/prompt-genera-mappa.md` — prompt da dare a Claude Sonnet/Opus per generare
  mappe importabili in MappAI (schema JSON completo + metriche di valutazione post-import)
- ✅ `buildBranchPromptJSONL`: desc richiesta estesa 30-50 → **50-80 parole** con obbligo dati specifici
- ✅ `buildPhase4Prompt`: vocabolario `rel` arricchito (smaschera, condanna, contraddice, rafforza,
  giustifica, è condizione di, è conseguenza di, legittima, alimenta) + avviso "usa solo ID reali"

### ⚠️ Lezione appresa — Apertus NON regge few-shot JSON in-context (7 giugno 2026)
Archiviata in [`docs/model-evaluation/apertus-mistral-infomaniak-evaluation.md`](../docs/model-evaluation/apertus-mistral-infomaniak-evaluation.md)
(§"REGOLA CRITICA"). Riguarda solo Apertus/Infomaniak — non applicabile mentre il
focus è su Google Gemini, ma da rileggere prima di riprendere quel lavoro.

### Completato nella sessione 5 giugno 2026 (cherry-pick merge/relink su dev)
- ✅ Portato su branch `dev` (cherry-pick manuale da `feat/structural-suggestions`):
  `mappai-node-merge.js`, `dev-console-metrics.js`, modale `#link-family-modal`, voci menu contestuale

### ✅ Parametri di riferimento qualità — Google/Gemini (9 giugno 2026)

#### KG Community su Google — configurazione production-ready
| Parametro | Valore | Note |
|---|---|---|
| Modello | `gemini-2.5-flash` | o `gemini-2.0-flash` per risparmio |
| Modalità | KG Community (default su Google) | `mappai_kg_community_mode` non serve settarlo |
| `maxOutputTokens` | 16384 | `getMaxOutputTokens(8192)` × 2, cap 16384 |
| `thinkingConfig` | **ON** (thinking abilitato) | budget 16384 > soglia 8192 → thinking preservato |
| `enrichDescs` | ON (opzionale) | safety net gratuita: costo 0 se desc già ricche |
| **Risultati attesi** | ~38 nodi, density ~1.7, ~47% cross-links, ~29 relTypes, 0% generic, SourceCov ~89% | Baseline run 9/6/26 |

#### MindMap Multi-pass su Google — configurazione finale validata (9/6/26, run 19:08)
| Parametro | Valore | Note |
|---|---|---|
| Modello | `gemini-2.5-flash` | |
| Modalità | Multi-pass (multiPassMode ON) | |
| `thinkingConfig` | **OFF** automatico per fasi con budget ≤ **12288** | Soglia alzata da 8192: copre Phase 1/1.5/1.6/3/4/5 |
| Condizione thinking | `maxOutputTokens > 0 AND ≤ 12288` (rimosso vincolo responseMimeType) | Phase 4/5/1.5 usano output testuale, non JSON MIME |
| **Phase 1 L1 gen** | `window.getMaxOutputTokens(3000)` → 6000 per gemini-2.5 | Causa REALE trovata: schemaL1 ARRAY senza `maxItems` |
| **schemaL1 maxItems** | **7** (CRITICO) | Senza limite il modello riempie l'array fino al budget esatto-12 tok (riprodotto a 6000/8192/12000 → 5988/8180/11988). `maxLength` sui campi NON basta: limita le stringhe, non il numero di elementi |
| **schemaL1 maxLength** | label:60, rel:30, ambito:120, desc:500, confini:300 | Difesa aggiuntiva sulla verbosità per-campo |
| **Phase 1.5 validation** | `window.getMaxOutputTokens(1500)` → 3000 | |
| **Phase 1.6 split** | `window.getMaxOutputTokens(3000)` → 6000 | Output: max 2 oggetti JSON — non tronca |
| **Phase 3 branch** | base **4096** → 8192 per gemini-2.5 | Era 3000 → 6000: JSON ramo da 5988 tok troncava |
| **Phase 4 merge** | base **6500** → 13000 per gemini-2.5 | Era 2000 → 4000 con thinkingBudget:0 → merge aggressivi |
| **Schema branch** | `chunks` rimosso (era required) | Inflation token: AI riproduceva verbatim dalle fonti |
| **sourcesDict fallback** | Popola da `desc` se chunks assente | Preserva sourceCov invariato |
| **`getMaxOutputTokens`** | localStorage fallback per model detection | DOM può essere null durante loop rami |
| **Risultati validati** | `truncated: 0/22`, 77 nodi, 6 L1, density 1.221, 25.5% crosslinks, sourceCov 90.9%, 0% generic | Run 9/6 19:08 ✅ |

#### MindMap Iterativa su Google — alternativa più robusta
| Parametro | Valore | Note |
|---|---|---|
| Modello | `gemini-2.5-flash` | |
| Modalità | Iterativa (multiPassMode OFF) | |
| Full tree call | `maxOutputTokens: 16384`, thinking abilitato | Single-pass per tutto l'albero |
| **Risultati attesi** | ~56 nodi, 5 L1, maxLevel 3, 0 troncamenti | Run 9/6/26: `truncated: 0/16` |
| **Limite** | maxLevel 3 (albero meno profondo del multi-pass) | Compensato da robustezza e velocità |

#### Regola generale thinkingBudget (in `fetchModelAPI`) — aggiornata 9/6
```
provider=google AND model~=gemini-2.5|gemini-3 AND maxOutputTokens > 0 AND maxOutputTokens ≤ 12288
→ inietta thinkingConfig: { thinkingBudget: 0 }
```
Rimosso vincolo `responseMimeType=application/json`: Phase 4 (===MERGES===) e Phase 5 (===RECLASSIFY===)
usano output testuale ma subivano lo stesso problema thinking. Soglia alzata 8192 → **12288** per coprire
Phase 3 a 8192 (4096×2) con margine futuro. KG Community a ~16000 resta fuori → thinking preservato.

### Da fare subito (prossima sessione)
0. ✅ **Token budget MM multi-pass RISOLTO** — `truncated: 0/22` validato (9/6 sera)
1. **Mappe tree-like con coerenza semantica interna** — NUOVO OBIETTIVO PRINCIPALE
   Vedi TODO.md §1 per la specifica completa. In sintesi:
   - Ogni ramo deve essere semanticamente coerente e profondo (L3-L4 reali, desc dense)
   - I cross-link sono ammessi SOLO come conseguenza di Phase 4 MERGE: quando un nodo
     duplicato in una macro-area meno pertinente viene fuso verso quella più pertinente,
     il link di fusione diventa l'unico cross-link ammesso
   - Nessun cross-link sintetico generato solo per aumentare la density
   - **Implicazione pratica**: valutare se disabilitare la sezione CROSSLINKS in Phase 4,
     lasciando solo MERGES. Le relazioni inter-ramo emergono naturalmente dai merge.

2. **UI Piano 1.2 — pannello suggerimenti strutturali** — TODO §3

> ⚠️ **Focus provider: Google Gemini.** Lavoro su Apertus 70B / Mistral Small 119B
> sospeso e archiviato in `docs/model-evaluation/apertus-mistral-infomaniak-evaluation.md`.
> "Test Kimi-K2.6 con pipeline completo" e "Chunking map-reduce per Infomaniak"
> rimangono in backlog (TODO §2 e §11) ma non sono prioritari finché il focus
> resta su Google.

### Da fare dopo
5. Refactoring CSS (703 `!important`)
6. Pulizia root progetto (20 script Python, file .bak)
7. Decomposizione `app.js` in moduli separati

### Flag feature disponibili (tutti gated da localStorage)
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
| `mappai_legacy_float_btns` | **Ripristina i 7 bottoni flottanti storici** del bordo destro (Cloze 📝 20 · Padronanza 🎯 84 · Progressi 📈 148 · Percorso 🧭 212 · Palazzo 🏛️ 276 · Dungeon 🎮 340 · Lavoro 🔥 404). Con feature 001-menu-reorg tutto vive nel launcher Studio attivo (viste+strumenti) e la colonna è vuota; `'1'` torna alla disposizione precedente | OFF |

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
