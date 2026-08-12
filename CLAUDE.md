# CLAUDE.md — MappAI Swiss Edition
> Documento di briefing per Claude Code.
> Autore: Giacomo Meschini — giacomo@insegnai.ch
> Ultimo aggiornamento: 5-6 agosto 2026 (STILE «MANIFESTO»: landing e COSTRUISCI sul progetto
> Inkscape di Giacomo — rail delle tre forme, riquadri chiari, e il **bento** delle opzioni al posto
> del modale «Genera materiali». La composizione del bento è un DATO e si compone trascinando
> nell'**Officina §7**. Dal 5/8 anche le CONSOLE hanno il loro bento e la loro officina
> (`public/dev/officina-console.html`), coi parametri divisi per gerarchia: globale → vista →
> riquadro → voce.
> **👉 PUNTO DI RIPRESA: [`docs/HANDOFF.md`](docs/HANDOFF.md)** — unico documento di STATO
> (che cosa c'è in `main`, che cosa è acceso e con quale interruttore, che cosa manca, come si
> verifica). I tre `HANDOFF-*.md` sono **diari**: si leggono per il perché di una decisione, mai
> per sapere com'è fatto il codice adesso.
> ⚠️ Questo file (`CLAUDE.md`) è il **diario giorno per giorno** ed è lungo 4.500 righe: le sue
> sezioni sono in ordine di scrittura, non di verità. Dove i due si contraddicono, vale HANDOFF.md.)

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
- **Il repo ha il suo grafo** (1/8/26): `graphify-out/graph.json` — 5385 nodi, 8835 archi,
  252 comunità etichettate (corpus CURATO: public/js senza vendored/minificati, main.js,
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

## 11. SESSIONE DI SVILUPPO CORRENTE — PRIORITÀ

### 🔵 IN CORSO (1/8/26): VISTA STUDIO — layout deterministici nel ciclo LAYOUT (banco → app)
Percorso completo in 3 sessioni: banco di prova → decisioni con Giacomo → integrazione in app.
Decisioni utente: tutti e 7 i motori in app · card anche sul canvas · PDF A4 orizzontale ·
persistenza nel progetto ora, vault (`Layout/<nome>.json` + IPC) in una sessione futura.
- **Laboratorio** `tools/banco-layout/` → `public/dev/banco-layout.html` (README nel folder):
  pagina che misura i layout sui vault veri (incroci, archi-su-card, ingombro…), carica
  cartelle vault o JSON per trascinamento, registro delle prove con cartella del grafo, PDF.
  I numeri hanno guidato tutte le scelte (es. hub COMM_* mai come archi → banda colore;
  ortogonale+ponticelli per BES/DSA; metodo delle priorità: 67s → 494ms su 70 nodi densi).
- **Moduli nuovi** (dopo `mappai-node-merge.js` in index.html):
  - `mappai-studio-layouts.js` — FONTE UNICA (app + banco, il build del banco lo embedda).
    7 motori UMD puri: `dag` (Sugiyama: cicli INVERTITI mai persi, livelli, fittizi,
    priorità), `td` (Reingold-Tilford su albero portante, foresta multi-radice), `anelli`
    (BFS concentrico da un fuoco, `centerId`), `colonne` (icicle adattato: colonna per ramo
    L1), `percorso` (ordine topologico a serpentina numerata = scaletta di studio), `fasci`
    (bundling gerarchico Holten semplificato, beta 0.85), `matrice` (adiacenza, righe/colonne
    per gruppo). + porte sul bordo, ponticelli agli incroci (stadio POST-misura), profondità
    topologica, misure sulla geometria disegnata. +8 test `tests/studio-layouts.test.js`.
    subRows resta come leva interna (default '1', UI eliminata su decisione utente).
  - `mappai-studio-draw.js` — renderer a card condiviso (overlay, Focus, banco-matrice).
    SOLO attributi SVG (niente classi) → il clone per il PDF è fedele. Palette = `colorScale`
    dell'app + `customColors` del vault; gerarchia visiva (foglie 0.65 / livello / taglia);
    badge numerati del percorso; fasci colorati per macro-area di partenza.
  - `mappai-studio-view.js` — il passo «STUDIO» del ciclo: overlay `#studio-overlay` DENTRO
    `#d3-container` (il force resta intatto sotto), tab sidebar `vista` (visibile solo qui),
    profilo in `appState.studioProfile` (persistito col progetto), menu contestuale
    (Focus vicini/parentela · Anelli da qui · copia etichetta), finestra Focus con PDF,
    export PDF A4 orizzontale (jsPDF+svg2pdf vendored, font → Helvetica nel clone).
- **Ciclo LAYOUT** (`mappai-d3-render.js` toggleLayout): default → orbita → radiale/separato
  → **STUDIO** → personale → custom. Kill-switch `mappai_studio_view='0'` → passo assente,
  ciclo storico intatto. Badge «STUDIO». Uscendo si smonta da solo; agganci `exit()` anche in
  backToLanding/importGraph/loadMapVault/directLoadVault (overlay MAI orfano su mappa nuova).
- **Comandi del tab**: 6 chip preset in testa (Nastro classico · Compatto · Colonna (da sx) ·
  Arioso da LIM · Leggibile BES/DSA · Albero puro — regolano SOLO geometria/motore/instradamento,
  il resto resta come l'ha messo l'utente) · motore ×7 · orientamento · instradamento · archi
  usati (calcolati dalla mappa) · linking words (no/brevi/intere) · gerarchia visiva ·
  **evidenzia al passaggio** (niente/vicini/parentela — hover nel renderer condiviso: sbiadisce
  nodi, archi, ponticelli ed etichette fuori dall'intorno; il filo del percorso e lo scheletro
  dei fasci NON contano come relazioni) · profondità (RICALCOLA il layout sul sottografo,
  ≠ slider «Mostra fino a» che nasconde) · spazi · taglia card · **dimensione testo nodi** e
  **testo linking words** · spunte **ponticelli** e **frecce separate sul nodo** (misurato
  nell'harness: 41→24 punte distinte spegnendole) · bande macro-aree · Esporta PDF.
- i18n: `tt_vista_tab` in ENTRAMBI i dizionari; `sv_*`/`tst_studio_on` in EN con fallback IT
  inline (regola 13).
- ✅ Verificato con harness sui moduli VERI (`public/dev/studio-harness.html`, appState finto
  + mappa Elettricità KG): ciclo radial→studio→default, overlay+tab montati/smontati, 7 motori
  disegnano, customColors rispettati, profondità 1 → 7 card, fsNode/fsRel applicati, menu
  contestuale → Focus vicini (11 card) / parentela (12) / Anelli da qui, PDF vista e PDF Focus
  salvati. Suite **928 pass / 0 fail** (+13). Banco rigenerato (910KB, con jsPDF embedded).
- **Review avversaria via workflow (20 agenti, 15 finding confermati, TUTTI corretti)**:
  `window.StorageManager` in persist() (const lessicale! regola nota) → `typeof`; loadProject
  senza guardia StudioView + layoutMode 'studio' serializzato → guardia + normalizzazione al
  load; collisione byEdge/porte su archi reciproci A⇄B dopo breakCycles → `_uid` da edgeList
  nelle chiavi; fasci fra alberi diversi senza LCA (arco perso o fra nodi sbagliati) →
  fallback linea diretta; spanningForest non ri-esplorava i promossi (discendenti tutti
  radici) → BFS ripresa a ogni promozione; anelli/measure su dataset vuoto → guardie; bottone
  FISSA cliccabile sopra l'overlay → guardia con toast in openLayoutModal; PDF: svg2pdf ignora
  `paint-order` (alone bianco SOPRA il testo) → alone rimosso dal clone, e nel banco copiate
  anche fill/stroke-opacity (le bande diventavano rettangoli pieni). +5 test di regressione.
- ⚠️ **Da testare in Electron vivo**: ciclo LAYOUT su mappa reale (MM e KG), overlay sopra il
  canvas vero (z-index con toolbar/menu radiale), profilo che sopravvive a riapertura progetto,
  PDF scritti su disco (vista, Focus, banco — controllare etichette e bande), tasto destro
  senza doppio menu, ELABORA→cambio progetto→ritorno alla mappa CON studio attivo (il caso
  della review), kill-switch, switch lingua EN.
- Prossima fase concordata: vault `Layout/<nome>.json` + «Esporta layout» a nome obbligatorio
  (IPC in main.js), caret sul bottone LAYOUT per il salto diretto fra modalità.

**Taratura di partenza (1/8 sera, scelta da Giacomo dal vivo)**: `DEF_PROFILE` = livelli **156px**,
card **30px** di distanza, **118×54**, testo nodi 12 / linking words 10, **ponticelli spenti**,
frecce separate accese, bande spente, «Mostra fino al livello» = tutti. Vale per le mappe nuove:
i progetti con un `studioProfile` già salvato tengono la loro taratura (la migrazione riempie
solo le chiavi mancanti, non riscrive quelle esistenti).

**Round 2 (1/8 sera) — la focus-map prende tutta l'area, il PDF la segue, la desc esce dal tooltip.**
Tre richieste di Giacomo, tutte in `mappai-studio-view.js` (+3 righe in `mappai-studio-draw.js`).
Suite **928/0** invariata; verificato nell'harness sui moduli VERI e nella pagina reale dell'app.
1. **Focus a tutta area.** Non è più una finestrella col velo al centro dello schermo: l'overlay
   `#sv-focus-ov` sta DENTRO `#d3-container` (z-index 6, sopra `#studio-overlay` a 5, che resta
   intatto sotto → chiudendo il focus la vista d'insieme si ritrova senza ricalcolare). Misurato:
   overlay = contenitore al pixel (1083×732), testata 54 + disegno 679. La testata è a **riga
   sola** (`flex-wrap:nowrap` + ellissi): a capo si mangerebbe l'altezza del disegno (in un
   pannello stretto il disegno era finito a 0px — trovato misurando).
   - **Profilo Focus separato** `appState.studioProfile.focus` (`DEF_FOCUS`: orient 'auto',
     gapLayer 96, gapNode 30, w 210, h 64, fsNode 13, fsRel 11). Le stesse leve regolano cose
     diverse nei due contesti: un profilo unico avrebbe travasato la taratura della vista
     d'insieme sul focus (card piccole appena entri) e viceversa. Persiste col progetto.
   - **Tab ridotto col focus aperto**: restano orientamento (auto/↓/→), spazio fra livelli,
     spazio fra card, larghezza/altezza card, testo dei nodi, testo linking words + metriche,
     PDF, «Chiudi il focus». Spariscono preset, motore, instradamento, archi usati, gerarchia,
     evidenzia, profondità, ponticelli/frecce/bande: sono le leve che corromperebbero il ritaglio.
   - Il menu contestuale dentro il focus non ha «Anelli da qui» (cambierebbe la vista sotto).
2. **«Esporta PDF» segue quello che guardi**: col focus aperto il bottone del tab esporta LA
   FOCUS-MAP (`Focus-<nodo>-<vicini|parentela>.pdf`), altrimenti la vista (`Studio-…`). Provato
   intercettando jsPDF: 30 card e `Studio-Elettricità-dag.pdf` per la vista, 9 card (= il
   sottografo) e `Focus-Alessandro Volta-parentela.pdf` per il focus; font Helvetica, niente
   alone. Il bottone PDF nella testata del focus è stato tolto: uno solo, sempre nello stesso posto.
3. **La descrizione esce dal tooltip.** Il `<title>` SVG delle card non porta più la desc (si
   apriva da solo e copriva le card): ora è il comando **«Descrizione»**, prima voce del menu
   contestuale, sia sulla mappa intera sia dentro una focus-map.
   - **Apre la scheda VERA della mappa D3** — `window.openSourceModal(id)`, la «Scheda Focus»
     (intestazione colorata per livello, parentela L0›L1›…, desc intera, link, immagini, fonti e
     note, Tutor AI del nodo, strumenti di lettura). Una seconda scheda solo per la vista studio
     avrebbe fatto divergere due superfici che dicono la stessa cosa. La scheda `.pm-*` scritta
     qui resta solo come **ripiego** dove `openSourceModal` non esiste (harness, banco).
   - **ESC a strati**, verificato nella pagina reale: menu → Scheda Focus (la chiude
     `closeActiveModals` di app.js; la vista studio si tira indietro con una guardia su
     `#source-modal`, altrimenti lo stesso ESC chiudeva anche la focus-map) → focus-map →
     la vista studio resta (si esce col ciclo LAYOUT).
   - `openFocus` su un id fuori dalla vista corrente non apre più un overlay vuoto (toast).
- ⚠️ Corretto misurando: il renderer cappava il corpo dei nodi a **16px**, quindi la leva «Testo
  dei nodi» smetteva di avere effetto a metà corsa (slider a 20 → testo 16). Tetto alzato a 24.

**Round 3 (1/8 sera) — i tre difetti del PDF, dal file vero di Giacomo.** Verificati aprendo il PDF
prodotto (`qlmanage`/`pdftoppm` a 400 dpi), non a occhio sullo schermo.
1. **Font**: l'export forzava `Helvetica` sul clone «perché svg2pdf conosce solo i font standard».
   Falso in questo repo: **Space Mono è vendorizzato** (`public/js/vendor/spacemono-font.js`, OFL,
   caricato in index.html) e va registrato NELL'ISTANZA jsPDF con
   `MappAISpaceMono.registerInto(doc)` PRIMA di `doc.svg()`. Il `font-family` sul clone deve essere
   la chiave ESATTA `Space Mono` (nuda: con apici o fallback svg2pdf non la trova — stessa trappola
   documentata in `mappai-d3-render.js:1251`). Verificato nel PDF: `/BaseFont /Space#20Mono` +
   `/FontFile2` (regular e bold).
2. **Etichette scentrate**: erano una CONSEGUENZA del punto 1 — svg2pdf applica `text-anchor:middle`
   spostando il testo della larghezza misurata col font registrato; con le metriche di Helvetica su
   glifi monospaziati lo scarto si vedeva. Col font giusto le etichette tornano centrate nella card
   (misurato sul render a 400 dpi), senza toccare la geometria.
3. **Frecce assenti**: svg2pdf **non rende i `<marker>`**. Le punte ora sono GEOMETRIA come tutto il
   resto del renderer (`arrowHead` in `mappai-studio-draw.js`: triangolo pieno sull'ultimo segmento,
   vertice sul punto d'arrivo, lungo 4.5× e largo 2× la stroke = le misure esatte del marker che
   c'era prima, quindi lo schermo non cambia). I `<marker>` e le `defs` sono stati tolti: erano
   l'unico pezzo di resa che non fosse geometria pura. Le punte entrano in `edgeEls` → sbiadiscono
   con l'evidenzia al passaggio come i loro archi. Verificato: 41 archi → 41 punte, 0 `<marker>`.
- Ripreso anche l'**alone** delle linking words con la tecnica dell'export mappa (copia bianca
  DIETRO + testo davanti senza stroke): svg2pdf ignora `paint-order`, prima l'alone si toglieva e
  basta. Ora nel PDF le parole-legame restano leggibili sopra gli archi.
- Il banco (`public/dev/banco-layout.html`) incorpora il renderer → **rigenerato**.

**Round 4 (1/8 sera) — dove finiscono le linking words, e come si distribuiscono le linee.**
Richiesta di Giacomo dal PDF: la parola-legame scritta DENTRO il tratto va bene, ma quando cade su
un incrocio non si legge. Due interventi, misurati sui vault veri (`tools/banco-layout/data.json`),
non a occhio.
1. **Posizionatore delle etichette** — `placeEdgeLabels` in `mappai-studio-layouts.js` (puro,
   +5 test). Il punto non è più il centro del segmento più lungo: si generano posizioni candidate
   scorrendo i segmenti lunghi della polilinea (fino a 5 segmenti × 13 posizioni) e si sceglie
   quella col costo minore — pesa card toccate (12), linee altrui attraversate (3), altre etichette
   (5), segmento troppo corto per il testo, distanza dal centro. Greedy con le etichette **più
   lunghe per prime** (hanno meno posti dove stare) + 3 **passate di riassestamento**: chi ha
   scelto per primo l'ha fatto a campo vuoto, chi resta in conflitto ripassa vedendo il quadro
   completo. Deterministico (a parità di costo vince l'indice più basso). Griglia spaziale sugli
   ostacoli: 5ms su 71 archi.
2. **Corsie del corridoio aperte quante servono** — `makeLaner` prendeva sempre `n` fisso
   (9 corsie con 156px) e assegnava `k % n` partendo dal bordo: con 2 archi in un corridoio le
   due orizzontali finivano appiccicate IN ALTO e il centro restava vuoto. Ora `laneCounts`
   conta prima quante linee piegano davvero in ogni corridoio e le corsie si aprono `n = min(nMax,
   linee)`, **centrate** (`passo = gapLayer/(n+1)`); i tratti dritti non consumano corsia.
- **Misura** (profilo di partenza, etichette pulite = nessuna linea/card/etichetta nel riquadro):
  | mappa | prima | dopo |
  |---|---|---|
  | KG Elettricità dag ↓ (71 archi) | 21/71 pulite · 45 su una linea | **58/71** · 13 |
  | KG Elettricità dag → | 28/71 · 41 | **54/71** · 17 |
  | KG Elettricità albero ↓ | 11/71 · 59 | **29/71** · 39 |
  | MM dag ↓ (52 archi) | 31/52 · 19 | **51/52** · 1 |
  | MM dag → | 30/52 · 20 | **46/52** · 6 |
  («prima» = codice di stamattina: centro del segmento più lungo + corsie fisse; «dopo» = i due
  interventi insieme.)
  Etichette **sopra una card: sempre 0** (prima 1-3). Costo sugli incroci del disegno: +2%
  (KG ↓ 206→210, → 176→189) — la redistribuzione delle corsie allunga qualche gomito. Scambio
  accettato: l'incrocio in più è leggibile, la parola sull'incrocio no.
- Il numero di etichette rimaste accavallate compare nella riga delle misure del tab
  (`sv_lbl_conflitti`): dice quando la mappa è troppo fitta per quella taglia di card e spazi.
- Aggiunto un `ResizeObserver` sul contenitore (vista e focus si re-inquadrano quando l'area
  cambia). ⚠️ Non verificabile nel pannello browser: con `visibilityState: hidden` le notifiche
  del ResizeObserver non arrivano (stessa trappola del rAF, §TRAPPOLE) — da guardare in Electron.
- Il velo della scheda è posizionato TUTTO inline: con `class="fixed inset-0"` dipendeva da
  Tailwind e nell'harness (senza Tailwind) il modale finiva in flusso — le classi `.pm-*` dentro
  il riquadro restano, quelle sono dell'app.
- ⚠️ **Da testare in Electron vivo (oltre alla lista sopra)**: focus a tutta area col menu
  radiale e la barra `#map-control-card` (z-30, fuori dal contenitore → resta sopra), PDF del
  focus scritto su disco, scheda Descrizione su desc lunghe e con formule KaTeX (chiama
  `renderLatexInElement`, §9), profilo Focus che sopravvive alla riapertura del progetto.


### ✅ FATTO (2/8/26): ATLANTE UI — il vocabolario dell'interfaccia, generato dal codice
`node tools/atlante-ui/build.js` → `public/dev/atlante-ui.html`. Serve a **parlare della UI senza
ambiguità**: scegli una superficie dal menu, la vedi col CSS vero, ogni pezzo ha un cartellino
numerato e la tabella dice nome · classe · famiglia · campo dello schema. Passando sopra una riga
si accende il pezzo nel disegno; passando sopra il pezzo si accende la riga.
- **47 superfici, nessuna ridisegnata a mano**: 10 console (SCHEMA letto da
  `public/dev/console-mockup-*.html` e ridato a `MappAIModal.render`) · 25 modali statici (blocchi
  `<div id="*modal*">` di index.html, neutralizzati) · 12 overlay dinamici (da
  `tools/campionario-modali/samples-dinamici.js`). **553 pezzi riconosciuti in totale**, minimo 3
  per superficie, 0 errori console, 184ms per ciclare tutte e 47.
- **`tools/atlante-ui/glossario.js` (95 voci) è il prodotto vero**: l'annotazione NON è scritta
  superficie per superficie — la pagina cammina il DOM e riconosce i pezzi col glossario, quindi
  una voce nuova annota di colpo tutte le superfici che la contengono. Vince il primo selettore
  che combacia → l'ordine è la priorità.
- Le ultime voci riconoscono **per forma, non per classe** (velo/riquadro marcati a runtime per
  posizione, `role=dialog`, `table`, `label`, `h1-h4`, area con scorrimento…): senza, l'atlante
  saprebbe nominare solo il codice nuovo — cioè quello di cui si parla di meno. Con esse la Scheda
  Focus passa da 2 a 6 pezzi, `config-ai-modal` da 4 a 9.
- Righe marcate «nel markup, non visibile in questo stato» (es. F2 ha la navigazione chiusa: 23
  pezzi, 18 cartellini) — evita la domanda «e allora dov'è il cartellino 19?».
- `?s=<id>` apre una superficie diretta: **un link punta a un pezzo preciso**.
- ⚠️ Tre trappole trovate misurando, tutte già corrette nel codice: `docPos` con un TreeWalker per
  elemento era O(n²) e bloccava la pagina (l'ordine di comparsa è già quello di `querySelectorAll`);
  `requestAnimationFrame` non scatta a pannello nascosto e `setTimeout` è strozzato a ~1/s →
  annotazione **sincrona**; il pannello parte a `innerWidth:0` e ogni riquadro si misura largo 0.
- **Skill portabile**: `~/.claude/skills/atlante-ui/` (SKILL.md + `assets/atlante-runtime.js` ·
  `glossario-base.js` · `atlante.css`) — stessa procedura su qualunque progetto frontend.
- **Gergo concordato**: `superficie › pezzo`, dove «pezzo» è il NOME della seconda colonna.
  Es. `Registro › badge della voce`, `Cabina E1 › elenco modificabile «Materie»`.

**Round 2 (2/8) — dai rilievi di Giacomo, e le quattro idee messe a terra.** 70 superfici,
**1288 pezzi**, 0 errori console, 0 superfici sotto i 3 pezzi.
1. **Il passaggio non porta più la pagina sulla tabella.** Con lo `scrollIntoView` sull'hover la
   vista scappava sotto le dita e non restava acceso niente. Ora il passaggio **illumina e basta**;
   è il **clic** che sceglie: la riga resta **fissata** (`data-atl-sel`, ambra piena) finché non se
   ne sceglie un'altra, ESC la toglie. Sopravvive a riordino, filtro e ridisegno dei cartellini.
   Il clic sul disegno è intercettato **in cattura** con `preventDefault`: i campioni contengono
   bottoni e link veri, che non devono agire.
2. **Tabella ordinabile** per numero · nome · classe · **famiglia**, clic sull'intestazione e
   secondo clic per invertire, con `aria-sort`. A parità torna sempre **l'ordine di comparsa**:
   dentro una famiglia si legge dall'alto della schermata, non a caso. I «senza classe» vanno in
   fondo quando si ordina per classe.
3. **STATI** (23 superfici nuove, gruppo suo): navigazione chiusa · elenco vuoto · seconda scheda
   attiva, ottenuti **mutando lo schema vero**. Più **uno stato rotto di proposito**
   (`console-a-unica--rotta`, senza navigazione): se tutte le superfici sono valide, il riquadro
   del validatore non lo si vede mai e non si impara la lingua con cui il motore contesta.
4. **Verdetto del validatore accanto al disegno** (`CORE.validaSchema` in fase di build): stessa
   parola in tre posti — il pezzo nel disegno, la riga in tabella, il messaggio che lo contesta —
   e i nomi citati nel messaggio sono **cliccabili**, fissano il pezzo.
5. **Copertura = classifica di migrazione**: tutte le superfici ordinate per percentuale di pezzi
   che hanno un nome NEL CODICE. Calcolata ciclandole davvero (301ms) dietro un bottone. Esito:
   **0%** per Velo di caricamento, QR proiettore, Conferma, hub — sono a stile inline; **96%** per
   le console del motore. Poche voci ≠ glossario incompleto: superficie fuori standard.
6. **Clic sulla riga = `superficie › pezzo` copiato negli appunti**, pronto da incollare in chat.
- Glossario a **101 voci** (aggiunti «stato vuoto della tabella», riga delle schede, riquadro di
  contesto della colonna, barra dei comandi, cella di scelte).

**Round 3 (2/8) — nel menu entrano le console VERE dell'app.** 98 superfici, **1988 pezzi**, 0 errori.
Mancava l'essenziale: INSEGNA e la Cabina non c'erano: il menu aveva solo i mockup, e la schermata su
cui Giacomo lavora ogni giorno non era nominabile.
- **`node tools/atlante-ui/cattura.js`** → `tools/atlante-ui/superfici-app.json` (14 superfici:
  INSEGNA ×5 · Cabina ×9). Apre `public/dev/atlante-cattura.html` in una **finestra Electron nascosta**
  (`show:false`, Electron è già dipendenza: niente jsdom da aggiungere), dove i **moduli veri**
  costruiscono i loro schemi con dati finti al posto del disco, e li legge dai due hook che i moduli
  già espongono: `MappAITeach._consSchema()` e `MappAICabina._schema()`.
- **Perché non leggerli dal sorgente**: quegli schemi nascono da dati (vault, classi, materiali) e da
  stato interno del modulo — l'unico modo di averli veri è farli costruire a chi li costruisce. Le
  console si aprono davvero e la cattura **clicca le voci di navigazione** per raggiungere gli stati
  (mappa scelta, LIVE, stampabili, lavagna).
- Dati finti calcati sulla schermata reale (La Carta · 2A · Storia · i 10 materiali): la superficie
  «INSEGNA — mappa scelta» ha **7 elenchi per genere** e 27 pezzi riconosciuti.
- Se `superfici-app.json` manca, il build non fallisce: avvisa e prosegue senza quelle superfici.
- ⚠️ Due difetti trovati alla prima cattura: gli overlay si **impilano** e il selettore prendeva il
  velo vecchio (ora si cerca nell'ULTIMO); gli id delle voci-mappa sono `v:<percorso del vault>`
  quando il progetto non è in localStorage, non `p:<id>`.
- **Da rifare quando cambiano le console**: `node tools/atlante-ui/cattura.js && node tools/atlante-ui/build.js`.

**Round 4 (3/8) — l'Atlante diventa il CANTIERE: dice anche dove va ogni superficie, e quanto costa.**
Richiesta di Giacomo: accelerare il passaggio alle console. L'atlante sapeva nominare i pezzi ma non
sapeva dire che cosa mancava, e la coda di lavoro viveva solo nell'handoff — cioè in prosa, senza
numeri. **103 superfici** (erano 98), **117 voci di glossario** (erano 101), 0 errori console.
1. **Il cantiere** (`tools/atlante-ui/cantiere.js` + sezione nuova nella pagina): ogni superficie con
   la sua **destinazione** e il suo **stato** — al motore · ponte · da migrare · da pensionare · fuori
   perimetro — più le righe **«nessuna destinazione decisa»**, che non sono lavoro ma *decisioni che
   mancano*, ed è quello che blocca il resto. Stato al 3/8: **28 da migrare · 2 ponti · 2 da assegnare
   · 5 da pensionare · 3 fuori perimetro · 16 già al motore**; in coda anche i 4 lavori che una
   superficie non ce l'hanno (i cloni della barra documenti, «File condivisi» senza contenitore,
   `renderRecentProjects`/`editGrade` senza ingresso, i 713 `!important`).
   - La destinazione è **scritta a mano** (è una decisione); il **costo no**, lo conta il codice —
     classi `.pm-*` + stili inline, sul blocco per index.html e sull'INTERO file per un overlay in JS,
     che è la scala giusta perché quel file si migra tutto insieme. Ordina la tabella: in cima esce il
     launcher di Studio attivo (**89**), poi il wizard del Tutor (47) e «Genera materiali» (39).
   - `build.js` **verifica ogni riga** contro le superfici raccolte: una destinazione che punta a una
     superficie inesistente è un avviso in fase di build, così il cantiere non può marcire in silenzio.
   - **Filtro del menu per stato**: scegliendo «da migrare» il selettore si riduce a quelle 28 e si
     passa dall'una all'altra senza tornare alla tabella. Sotto il nome della superficie compare
     sempre il bollino con destinazione e motivo.
2. **La landing e il cromo della mappa entrano nell'atlante** (5 superfici nuove): `#landing-view`,
   `#landing-mode-bar`, `#setup-form`, `#floating-actions-menu`, `#map-control-card`. Il menu radiale
   accanto al mockup **D1 che lo sostituisce**: senza le due facce nello stesso menu, la migrazione si
   discuteva a memoria. Neutralizzazione diversa dai modali: qui `hidden` **non** si toglie — la
   landing si apre vuota e il filtro classe è chiuso, cancellare quello stato mostrerebbe una
   schermata che non esiste in nessun momento.
3. **16 voci di glossario nuove** per quelle superfici (lastra della landing · marchio · header a due
   comandi · bottone Cabina · segmento di modalità · passo di COSTRUISCI · numero del passo ·
   bottone-fonte · scelta del genere di mappa · avvio rapido · campo di COSTRUISCI · menu delle azioni
   rapide · barra dei comandi della mappa…). Misurato: COSTRUISCI passa da 11 a **16 pezzi distinti**
   con nomi veri, la landing intera da 14 a **26**. ⚠️ La voce storica «bottone-card della landing»
   copriva con UN nome gli avvii rapidi e i bottoni-fonte, che fanno due cose diverse: eliminata e
   spezzata in due (vince il primo selettore che combacia, quindi una generica messa sopra le
   zittiva entrambe).
4. **La copertura ora ha DUE colonne, e il motivo è un difetto che ho introdotto io**: dando un nome
   ai pezzi della landing, la sua «copertura» è salita al 62% pur restando tutta fuori standard — la
   misura diceva «so nominarla», non «è migrata». Ora **«al motore»** conta i soli pezzi `.mm-*` (ed è
   la classifica di migrazione, ordina la tabella) e **«con un nome»** resta accanto. Landing e cromo:
   **0% al motore**, 25-67% con un nome. 42 superfici su 103 sono a zero.
5. ⚠️ **Trappola nuova, e costosa**: le superfici PORTANO markup, e la landing di `index.html`
   contiene uno `<script>` inline. Iniettata nei dati, la sua `</script>` **chiudeva il tag della
   pagina**: l'atlante si apriva muto e **senza un errore in console** — non c'era più uno script che
   potesse fallire. Due difese: gli `<script>` si tolgono dai blocchi estratti (è comportamento, non
   superficie) e i dati si scrivono con `JSON.stringify(...).replace(/</g,'\\u003c')`.
   ⚠️ Corretto anche: la marcatura velo/riquadro per posizione vale **solo per i modali** — applicata
   alla landing faceva chiamare «riquadro» il modulo di generazione.
- Verificato nella pagina vera a 1440×900 (server statico): 103 superfici nel menu, cantiere a 56
  righe coi contatori, filtro per stato (28 → 2 → 103), copertura ricalcolata su tutte le superfici in
  **683ms**, nessuno sbordo orizzontale, 0 errori console. ⚠️ La verifica visiva d'insieme della
  pagina scorrita non è stata fatta: col pannello nascosto `computer` va in timeout e lo screenshot
  esce bianco (trappola §TRAPPOLE) — le misure sono lette dal DOM.

### ✅ FATTO (3/8/26): STILE «MANIFESTO» — landing e COSTRUISCI sul progetto di Giacomo
Giacomo ha disegnato in Inkscape (`Inkscape/landing MappAI.pdf`, 5 pagine) come immagina la landing e
le console. Non è una riarchitettura: è **la pelle giusta sopra quello che è già in piedi** — pagina 4
è la Cabina 1:1 (stessi 4 gruppi, stesse 9 viste), pagina 2 è la vista ridotta di COSTRUISCI, la
colonna richiudibile e il chip esistono già. Quindi cambiano **token e veste, non moduli**.
Due file nuovi, tre righe toccate altrove. Suite **981/0** invariata, 0 errori console.
- **`public/css/mappai-stile-manifesto.css`** — ogni regola è scoped sotto `html.manifesto`: senza
  quella classe il foglio è **inerte**. Kill-switch `mappai_stile_manifesto='0'`.
  Palette **campionata dal PDF** (`pdftoppm` + istogramma, non a occhio): verde `#2fdc3c` = azione ·
  viola `#ac72fe` = attivo/contesto · `#8100f4` = cassetto insegnai · grigio `#989898` = spento ·
  nero = card dei moduli. **Ruoli decisi da Giacomo**: il verde qui È azione (ribalta la decisione del
  29/7 «un solo colore d'azione = indigo»; la deroga vive in due token, non sparsa).
- **`public/js/mappai-stile-manifesto.js`** — monta il **rail delle tre forme** (triangolo Costruisci ·
  esagono Elabora · cubo Insegna) al posto del selettore centrale, e il **mini-logo** in basso a
  sinistra che riporta alla prima pagina. Il rail non è un secondo comando: chiama gli stessi
  `MappAITeach.setMode()` e si ridipinge leggendo la modalità vera — duplicarlo nel markup vorrebbe
  dire due sorgenti che divergono al primo ritocco.
- **Memoria, la regola di Giacomo**: i **chip** (classe · materia · allievo) restano in localStorage e
  sopravvivono alla chiusura; la **posizione** Costruisci/Elabora/Insegna no. Verificato riavviando
  con `mappai_landing_mode='teach'` scritto a mano: dopo il boot vale `''` e la landing è vuota.
- **Contrasti misurati sul PDF**, e le due correzioni che ne sono seguite: bianco su verde `#2fdc3c`
  = **1,84:1** → il testo sul verde è **NERO** (11,42:1, e visivamente più marcato); nomi dei file in
  verde su bianco = 1,84 → `#047857` (5,48:1). Bianco su viola `#ac72fe` = **3,19:1**: sopra i 3:1
  che WCAG chiede alla grafica, sotto la soglia del testo — **tenuto per scelta di Giacomo** sul chip,
  dichiarato nella testata del foglio. Cassetto `#8100f4`: bianco sopra 6,48:1 ✓.
- **Quattro difetti trovati MISURANDO**, tutti corretti (e sono la parte utile):
  1. **Avvolgere `MappAITeach.applyMode` non intercetta niente**: `setMode` chiama la funzione
     **locale** del modulo, non quella esportata — la patch si applicava a un riferimento che nessuno
     usa. Il segnale vero è il DOM (`hidden` sui tre contenitori) → **MutationObserver**, indipendente
     da come il modulo è scritto dentro. `readMode`/`applyMode` restano esportate (servono a leggere).
  2. **Il chip spariva**: `#header-utils` sta dentro `.glass-card`, che ha `relative z-10` e crea uno
     **stacking context** — lo z-index del chip vale solo lì dentro, e la banda bianca in cima (z 55,
     contesto radice) ci finiva sopra. Misurato: presenti nel DOM a y=16, invisibili a schermo. Il JS
     sgancia l'header sotto `#landing-view`.
  3. **`padding-left` ignorato**: `#landing-view .glass-card{padding:29px !important}` — con due
     `!important` vince la specificità, e **un id batte due classi**. Il selettore porta `#landing-view`
     per forza, non per abitudine.
  4. **MM/KG restavano affiancati**: `#setup-form .mode-buttons-container{flex-direction:row !important}`
     in style.css. Serve id + `!important`; e impilandoli `basis-[160px]` diventa **altezza**, quindi
     ogni scelta veniva alta 160px (misurato) → `flex:0 0 auto`.
- ⚠️ **Trappola nuova e insidiosa**: a pannello nascosto le **transizioni CSS restano congelate sul
  frame di partenza**, e `getComputedStyle` serve quel colore. Le forme si misuravano tutte verdi con
  la classe `manifesto-vuota` già tolta — sembrava un difetto del CSS, non lo era: spegnendo le
  transizioni, spenta `#989898` e attiva `#ac72fe`, come previsto. **Prima di dire che una regola non
  vince, spegnere `transition` e rimisurare.** (È la sorella della trappola sulle opacità, §TRAPPOLE.)
- **Non fatto, e dichiarato**: nel disegno il campo ROOT sta **a destra** della scelta del genere.
  Affiancarlo con margini negativi è fragile — quello che c'è in mezzo cambia fra vista ridotta e
  vista piena, e un margine tarato su uno stato sovrappone nell'altro. Serve un contenitore a due
  colonne nel markup dello step: lavoro a sé, non una veste. Il campo per ora è solo **accorciato**
  (460px: un campo lungo 1240 per un titolo di tre parole promette un testo lungo).
- Nell'Atlante: 3 voci di glossario nuove (**rail delle modalità · forma di modalità · ritorno alla
  prima pagina**) → 120 voci.
- ⚠️ **Da testare in Electron vivo**: il rail su una mappa aperta (deve sparire con la landing), il
  chip con una classe VERA (là il viola si riempie), il cassetto insegnai che si apre col nuovo
  ancoraggio in basso, la combo della vista ridotta insieme al manifesto, e una generazione reale
  partendo da questa veste.

**Round 2 (3/8) — COSTRUISCI ridisegnato sul progetto, e il bento diventa il modale.**
Tre correzioni di Giacomo: il verde dev'essere l'**emerald già usato altrove**, il bento è **l'area
delle opzioni di generazione dei materiali** (non gli avvii rapidi), «Nuovo progetto» torna **grigio
con hover emerald**. File nuovo `public/js/mappai-costruisci-manifesto.js`. Suite **981/0**.
- **Il verde è `#34d399`**, non il `#2fdc3c` campionato dal PDF: un secondo verde a due passi dal
  primo si legge come un errore di stampa. Il testo sul verde resta **scuro** (10,24:1 misurato;
  bianco su emerald = 1,92).
- **Il bento È il modale «Genera materiali»**, portato in pagina: Classe (+ «Adatta alla classe» coi
  suoi tre ambiti) · Quiz e flashcard · Fogli nodi · Sintesi · Fonte originale · Stima chiamate AI ·
  e in fondo le due azioni affiancate, «Genera solo la mappa» (nera) e «Genera materiali» (verde).
  ⚠️ Le card portano gli **STESSI id** del modale (`mp-quiz-on`, `mp-ns-fmt`…): così
  `MappAIPipeline._readConfig()` resta l'**unico** posto che legge la configurazione — l'unica
  modifica alla pipeline è la guardia, che ora accetta il modale **oppure** il bento. Verificato che
  la stima si aggiorni davvero (`~5 (A 3 · B 0 · C 0 · D 2)`, e `~6` spegnendo il quiz): è la prova
  che a leggere è il codice vero. Con la veste accesa il vecchio bottone che apriva il modale è
  nascosto — due superfici con gli stessi id aperte insieme sarebbero un guaio.
- **Tabella dei file** accanto al bottone delle fonti, nel `.mm-tab-wrap` del motore: **NOME FILE ·
  DIMENSIONE** + cestino che toglie la fonte vera. ⚠️ La colonna **PAGINE è stata tolta su decisione
  di Giacomo**: sembrava un dato da leggere al volo, invece costava l'apertura del PDF con pdf.js —
  che prende il worker da una CDN. Non indispensabile, e toglierla toglie una dipendenza.
- **Layout a due colonne** (fonti | tabella · MM-KG | ROOT): il contenitore lo costruisce il JS.
  ⚠️ Un `float` non serve a niente: lo step è **flex**, e dentro un flex il float è ignorato
  (misurato: la tabella finiva sotto i bottoni).
- **Tre difetti veri trovati misurando**, tutti corretti:
  1. **La pagina si bloccava al primo file caricato.** Il ridisegno della tabella chiamava
     `safeCreateIcons()`, che è l'**hub globale** e riscrive le icone di tutta la pagina — comprese
     quelle dentro `#sources-container`, che è proprio ciò che il nostro osservatore guarda:
     ridisegno → icone → mutazione → ridisegno. Ora il cestino è un **SVG in linea** (stessa scelta
     di `mappai-doc-bar.js`, stessa ragione) e c'è una guardia anti-rientro.
  2. Un secondo loop, mio, nel conteggio pagine: il ricalcolo rispondeva «sto contando» e faceva
     ridisegnare. Sparito con la colonna.
  3. **Testo dei bottoni-fonte a 1,98:1**: `.source_btn_text` ha un colore SUO (slate-400) e non
     eredita quello del bottone. Va colorata l'etichetta, non il contenitore → 15,17:1.
- **Contrasti finali, tutti sopra 4,5**: fonte 15,17 · MM attiva 10,24 · Genera 10,24 · titolo card
  19,68 · opzioni 15,77 · stima 10,24 · Nuovo progetto 6,92.
- **`public/dev/costruisci-harness.html`** (nuovo): banco del solo modulo, con markup minimo e stub
  della pipeline. È servito a **isolare il blocco** — nell'harness non si presentava, quindi il
  colpevole era l'interazione con l'app, non il modulo. Da riusare per lo stesso motivo.
- ⚠️ Il pannello browser si è bloccato più volte durante la prova (renderer appeso dal loop): le
  misure finali sono state prese dopo il riavvio, sull'app vera a 1440×900.

**Round 3 (3/8) — OFFICINA §7: la composizione del bento diventa un DATO, e si trascina.**
Rilievo di Giacomo sul bento: corpi tipografici incoerenti, i **preset** mancanti, qualche bottone
troppo grosso, uno **fuori griglia**. Non erano tre sviste: la composizione non era scritta da
nessuna parte, quindi non poteva essere né controllata né discussa. Suite **991/0** (+10 test).
- **`public/js/mappai-bento-composizione.js`** (UMD, fonte UNICA: la usano officina E app):
  `VOCI` = l'inventario dei campi con gli **id veri** della pipeline · `MODULI` = la composizione ·
  `SCALA` = i corpi dichiarati · `valida()` = le tre domande a cui nessuno sapeva rispondere —
  **cosa è rimasto fuori** (i preset, appunto: una voce non montata sparisce dall'interfaccia e la
  pipeline usa il default), **quale riga non chiude le 4 colonne** (il bottone spaiato), **chi è
  staccato dal suo master** (resterebbe a schermo senza avere effetto).
- **Officina §7** (`public/dev/officina-bento.js`): inventario · griglia con **trascinamento**
  (+ tendina «sposta in…», perché un banco usabile solo col mouse esclude chi lavora da tastiera) ·
  titolo e larghezza in colonne per modulo · **anteprima con le classi VERE** · diagnosi ·
  **corpi misurati sull'anteprima** con chi esce dalla scala. Le modifiche vanno subito in
  `localStorage.mappai_bento_layout`, che l'app legge: si compone e si guarda nell'app, non su carta.
- **Scala unica**: erano 12 · 12,5 · 14 · 17px con pesi 600 e 700 mescolati (12 contro 12,5 è una
  differenza che nessuno ha deciso). Ora **tre** token — titolo 14/700 · voce 12/600 · azione 15/700
  — dichiarati sia nel CSS sia in `SCALA`, che è ciò che il banco confronta col reso.
- **Quattro difetti trovati dallo strumento stesso**, il che è il punto:
  1. **Falso positivo mio**: il validatore segnalava un figlio «staccato» anche quando il master
     stava fra le voci dello stesso modulo. Corretto + test.
  2. **Le variabili stavano solo su `html.manifesto`**: nell'anteprima (classe su un contenitore)
     `var(--man-nero)` non risolveva, la dichiarazione era invalida e la card usciva **trasparente**
     — il banco misurava i corpi del browser invece dei nostri. Token su `html.manifesto, .manifesto`.
  3. **Il marcatore anti-cache dell'officina non dipendeva dal foglio del manifesto**: si modificava
     il CSS e la pagina mostrava il vecchio. Ora `v` include tutti i file che serve.
  4. **19,2px nel bento**: `style.css` impone `font-size: calc(16px * var(--landing-zoom))
     !important` agli span dentro `.glass-card`. ⚠️ Il primo tentativo (`inherit !important`) ha
     **peggiorato le cose** — eredita dal padre, e il padre è colpito dalla stessa regola: il
     difetto si propagava invece di fermarsi. Serve il VALORE, con id + `!important`.
     Trovato dall'**harness** e non dall'officina: l'harness carica `style.css`, l'officina no —
     due banchi perché vedono cose diverse.
- **Preset rimessi** (tendina + Applica · Salva · Elimina): chiamano `Pipeline._applyPreset/
  _savePreset/_deletePreset`, nessuna logica nuova. Le due azioni chiudono la griglia affiancate
  (611px ciascuna) e le card scendono da 150 a **132px**.
- Misurato sull'app a 1440×900: bento 1236×745, 4 colonne da 298,5, **corpi 14/700 ×7 · 12/600 ×22 ·
  15/700 ×2** (tre, zero fuori scala), preset montati, stima viva, nessuno sbordo.
  ⚠️ Screenshot d'insieme non ottenibile: a pannello nascosto dopo uno scroll programmatico esce
  bianco (trappola §TRAPPOLE) — tutte le misure sono lette dal DOM.

**Round 4 (4/8) — il banco del bento diventa completo, e la composizione di Giacomo entra in casa.**
Sua revisione (7 moduli a una colonna, la classe fuori) + otto leve nuove. Suite **997/0** (+6 test).
- **Composizione di Giacomo adottata** come partenza. Il validatore dice, senza che nessuno lo
  chieda, che restano fuori **quattro voci** — ed è il motivo per cui ogni voce ora dichiara
  `seFuori`, cioè *cosa costa* non montarla: «Ambito» e «Titolo» ricadono su un default (nessuna
  perdita), **«Stima chiamate AI» no** (si sceglie senza vedere quanto costa: era la ragione per cui
  il modale è stato portato in pagina), e **«Classe destinataria»** avrebbe lasciato `classId` vuoto
  → i materiali fuori dalla cartella di classe.
  ⚠️ Per quest'ultima il modulo monta un **campo nascosto** col contesto attivo del chip: il chip È
  già il contesto, ripeterlo nel bento sarebbe la stessa informazione in due posti, ma `_readConfig`
  deve comunque trovarlo. Verificato: `<input type=hidden id=mp-class value="c1">`.
- **Le otto leve chieste**, tutte nel banco (Officina §7) e tutte applicate all'app:
  fondo · colore del testo · spessore e colore del bordo · **icona** (elenco Lucide + campo libero) ·
  **etichette riscrivibili** (titolo del modulo e nome di ogni opzione) · **larghezza dei campi** ·
  **altezza del modulo** · **riordino** dei moduli (maniglia ⠿ col trascinamento, frecce ↑↓ da
  tastiera). Una voce ora può essere una stringa o `{id, et, w}`: `vociDi()` normalizza, chi legge
  non deve saperlo.
- **Il contrasto è controllato mentre si sceglie**: accanto ai colori di ogni modulo c'è il rapporto
  calcolato, e sotto 4,5:1 diventa rosso + avviso. Provato mettendo il fondo bianco: **1:1**, badge
  rosso, avviso «non si legge». Un banco che lascia scegliere due colori senza dire se si leggono
  sposta solo il problema.
- Verificato che quello che si compone **arrivi davvero nell'app** (è il punto dello strumento):
  ordine dei moduli, bordo 2px emerald, altezza 200px, etichetta «Domande per ramo», campo Angolo a
  120px — tutto ritrovato nel bento di COSTRUISCI. Poi lo stato di prova è stato rimosso, così si
  riparte dalla composizione del file.
- ⚠️ Lo stile scelto diventa **inline** e non una classe: sono scelte per-modulo, non famiglie —
  una classe per ogni combinazione sarebbe un foglio che cresce a ogni ritocco.

**Round 5 (4/8) — i cinque rilievi di Giacomo sul banco, e la sua composizione entra in casa.**
Suite **997/0**. Quattro difetti su cinque avevano la STESSA radice: il renderer conosceva solo i
casi che avevo previsto io, e una composizione libera ne produce altri.
1. **«Genera Mappa» invisibile sul modulo blu.** Il modulo non aveva `nuda: true` (i moduli creati
   nell'officina non ce l'hanno), quindi l'azione finiva dentro una card e `pezzo()` — che non
   sapeva disegnare un'azione — tornava **stringa vuota**: riquadro colorato, nessun testo.
   Ora un'azione resta un bottone ovunque, e un modulo di **sole azioni È il bottone**
   (`soloAzioni()`, dedotto dal contenuto). `nuda` resta solo come deroga.
2. **Il colore del testo non cambiava niente.** Ogni pezzo dichiarava il SUO colore (#e6e6e6,
   #b9b9b9, #cfcfcf…): il contenitore obbediva allo stile inline e i figli no. Ora i figli fanno
   `color: inherit` e le gerarchie di lettura sono **opacità** — così seguono qualunque colore.
   Campi e bottoni interni ricavano fondo e bordo da `color-mix(currentColor)`: su un fondo chiaro
   un grigio fisso sarebbe sparito.
3. **«Per ramo» non si riusciva a riscrivere.** Nell'editor i moduli usavano lo **span reale**:
   a una colonna il campo dell'etichetta restava largo un dito. L'editor ora è una griglia leggibile
   (auto-fill 300px) e l'etichetta ha una **riga sua** — misurato: da illeggibile a **261px**.
   Il layout vero lo mostra l'anteprima, che sta lì sotto.
4. **«Adatta alla classe» esclusa → la taratura della classe si applica lo stesso** (scelta di
   Giacomo): il modulo monta una spunta **nascosta e accesa**. Chi ha assegnato preset e note a una
   classe le ha già decise una volta; richiederle a ogni generazione vorrebbe dire che quella
   configurazione non conta. Verificato togliendo la voce: `mp-adapt-on` NASCOSTA, `checked=true`.
5. **Composizione adottata**, poi rivista da Giacomo (4/8) in **riquadri chiari**: `#f7f7f7` con
   testo `#404040` (**9,68:1**), «Genera Mappa» blu e «Genera materiali» verde. Fuori dal bento
   anche «Adatta alla classe» → la taratura della classe attiva si applica dalla spunta nascosta.
   ⚠️ **Due colori corretti, misurando**: bianco su verde `#41e6aa` = **1,6:1** — la scritta
   dell'azione principale sparisce → testo **nero** (12,3:1, ed è la regola già fissata il 3/8 per
   l'emerald); bianco su blu `#4271ff` = **4,17:1**, sotto il minimo → blu scurito del **5%**
   (`#3f6bf2`, 4,57:1), stesso tono. A 15px bold non vale la soglia 3:1 del testo grande (serve
   ≥18,66px). Test nuovo: nessun modulo della composizione può avere una coppia illeggibile.
- Verificato nell'app: «Genera Mappa» è un `BUTTON` blu col suo testo, «Genera materiali» verde
  con testo nero, i riquadri col loro fondo, **tre corpi**, campo classe nascosto sul contesto
  attivo, nessuno sbordo.

**Round 6 (4/8) — riquadri chiari, tendine senza bordo, i tre avvii tornano nella vista compatta.**
Suite **998/0**.
- **Riquadri `#f1f4f8` con testo `#404040`** (9,68:1): il bento passa da nero a chiaro.
- **Tendine e campi senza bordo**: bordo **trasparente** (il posto resta occupato, così il campo non
  salta di 2px al fuoco) e riempimento a `color-mix(currentColor 14%)`. È la decisione del 31/7 sui
  campi del motore — a distinguere il campo è il riempimento, non una riga che su fondo chiaro fa
  1,23:1 e non si percepisce. Aggiunto `:focus-visible` con outline: tolto il bordo, il fuoco deve
  restare visibile.
- **I tre avvii** («Nuovo Progetto · Apri Vault · Apri JSON») **restano visibili anche nella vista
  ridotta**, dove due erano nascosti (`.mappai-ridotta` in tokens.css → serve `!important`), con
  fondo `#f1f4f8`, hover emerald e la **stessa taglia delle due azioni**: corpo 15px/700, icona
  26px — misurato identico. Tre corpi diversi in fondo alla stessa pagina si leggono come tre
  importanze che nessuno ha deciso.
- ⚠️ Le due correzioni di contrasto del round 5 sono state **mantenute** (il JSON rimandato le
  riportava indietro): nero sul verde (1,6 → 12,3:1) e blu `#3f6bf2` (4,17 → 4,57:1).
- Rete sulle icone: se al montaggio del bento `lucide` non ha ancora convertito gli `<i data-lucide>`,
  un secondo passaggio differito le ridisegna (il bento si monta una volta sola: nessun rischio di
  rientro).
- **Un solo grigio neutro** (4/8): il token `--man-card` passa da `#e5e1e1` a **`#f1f4f8`** e con
  esso, in un colpo, tutti i bottoni a riposo — i cinque bottoni-fonte, MM/KG non attivo, il chip
  vuoto, i tre avvii. Una leva sola invece di cinque regole: «tutti i bottoni non attivi allo stesso
  grigio» resta vero anche al prossimo pezzo che si aggiunge, invece di essere una coincidenza da
  rifare a mano. Contrasti misurati: etichetta 17,84:1 · MM/KG non attivo 6,87:1 · chip vuoto 6,06:1
  (tutti MIGLIORI di prima).
  ⚠️ Il **pallino Cabina** resta `#989898`: lì il grigio è un codice di stato su fondo bianco.
- **Round 7 (4/8), quattro ritocchi di Giacomo.**
  1. **Un verde solo**: `--man-verde` passa a **`#41e6aa`** — modalità attiva, hover dei
     bottoni-card e «Genera materiali» ora sono lo stesso colore (nero sopra: 12,3:1).
  2. **Il rail neutro** prende `#f1f4f8` come gli altri bottoni. ⚠️ Si **inverte**: fondo chiaro e
     segno **scuro** (`#404040`, 9,4:1) — un'icona bianca dentro un cerchio chiaro sparirebbe.
     Attivo resta viola col segno bianco.
  3. **Difetto vero del punto «allinea le dimensioni»**: il bottone era già a 15px, ma l'etichetta
     sta in uno `<span>` con un corpo **suo — 20px con 5px di spaziatura**. Stessa trappola di
     `.source_btn_text`: va imposto sull'etichetta, con id + `!important`. Ora 15px/700 come le due
     azioni, misurato identico.
  4. **Avvii a sola icona**: a riposo l'etichetta prende il colore del fondo e sparisce; al
     passaggio — e col **fuoco da tastiera**, che non ha hover — il bottone diventa verde e testo e
     icona tornano scuri. ⚠️ L'informazione starebbe tutta in un glifo: i tre bottoni ricevono
     `title` + `aria-label` dal loro stesso testo, così non dipende dal passaggio del mouse.
- **Round 8 (4/8)**: icone dei cinque bottoni-comando da 26 a **38px**, etichetta 4px più in basso
  (il blocco resta centrato, il testo non tocca il glifo). Lo stesso effetto «solo icona» passa ai
  due **Genera**, ma lì il fondo NON cambia (è già colorato): al passaggio compare la sola etichetta,
  **col colore del segno**.
  ⚠️ «testo del colore dell'icona» ha richiesto un pezzo nuovo: il CSS non sa leggere il
  `background`, quindi il colore del segno viaggia in una variabile (`--mn-seg`) che il modulo
  scrive nello stile inline, mentre il testo prende il colore del fondo. Su un bottone-azione, il
  colore scelto nell'officina è quindi quello del **segno**, non del testo — e la stessa regola vale
  nell'anteprima dell'officina. Misurato: segno `#0b0b0b` sul verde (12,3:1 al passaggio) e
  `#ffffff` sul blu (4,57:1); `:focus-visible` si comporta come l'hover.
- **Round 9 (4/8)**, dai tre rilievi di Giacomo:
  1. ⚠️ **Il testo dei due Genera non cambiava al passaggio, e la causa era mia**: avevo scritto
     `color` nello **stile inline**, che batte qualunque regola non-important — l'hover del foglio
     non poteva vincerlo. Ora l'inline passa solo due VARIABILI (`--mn-seg` e `--mn-fondo`) e a
     scegliere è il CSS, dove la cascata funziona. Verificato anello per anello: a riposo il testo
     vale `var(--mn-fondo)` = il fondo (quindi la regola CSS governa davvero), la regola `:hover`
     punta a `var(--mn-seg)`, lo span eredita (nessuna regola lo colora).
  2. **Icone a 44px** (+ `display:block`, così non portano lo spazio di riga del testo).
     ⚠️ La centratura orizzontale era **già esatta**: misurato scarto **0px** fra il centro del
     glifo e quello del bottone — quello che si vede è un effetto ottico della forma dell'icona
     (`folder-open` ha il lembo a destra), non un difetto da correggere.
  3. **I bottoni-fonte diventano bottoni-comando**: stessa taglia (130px), stesso raggio (16), icona
     44px, etichetta 15/700 nascosta nel fondo che si rivela al passaggio. Erano più piccoli e col
     testo sempre a vista — due famiglie per lo stesso gesto. Con l'etichetta nascosta, `title` +
     `aria-label` diventano obbligatori: li ricevono anche loro e i due Genera.

**Round 10 (4/8) — la veste GIRA in Electron, e due difetti che solo lì si vedevano.**
Provata l'app vera col **debug remoto di Chromium** (`npx electron . --remote-debugging-port=9222`):
`Runtime.evaluate` per misurare, `DOM.setFileInputFiles` per caricare un PDF VERO (il dialogo nativo
non si pilota), `CSS.getMatchedStylesForNode` per sapere **quale regola vince davvero**. Viewport
1470×891, **0 errori console**, suite **998/0/2** prima e dopo. Resoconto completo in
[`docs/HANDOFF-manifesto.md`](docs/HANDOFF-manifesto.md) §8.
- **Funziona**: landing vuota (rail verde d'invito, mini-logo nascosto, cassetto insegnai, chip
  «4R · Scienze» vero) · COSTRUISCI (forma attiva viola, le altre `#f1f4f8`, marchio e cassetto via)
  · **PDF vero estratto, 15.178 token**, tabella file 3 `<col>`=3 `<th>`=3 `<td>` · bento coi 7
  moduli e i due campi nascosti (`mp-class` porta la CLASSE VERA) · **tre corpi** e nient'altro (i
  19 «fuori scala» sono `<option>`, che disegna il browser) · etichetta nascosta a riposo su
  entrambi i Genera · **rail assente con una mappa aperta** · vista ridotta e manifesto convivono.
- 🐛 **Metà pagina bianca finché non carichi un file**: la riga delle fonti è sempre `340px | 868px`,
  quindi senza file restano **868×426 di bianco** e i cinque bottoni si accalcano **due per riga**.
  Ora `_disegnaTabella` mette `mn-riga--sola` quando non ci sono file → una colonna, i cinque in
  fila (238×130, come i tre avvii); al primo file torna `340 | 868` e i bottoni a 164.
  ⚠️ La prima stesura non vinceva: la regola di partenza porta `#setup-form` e **un id batte tre
  classi**.
- 🐛 **48px d'aria fra il tema e il bento in vista ridotta**: con la veste `impagina` porta il campo
  del tema fuori da `#step-3-container`, che resta **alto 0 ma consuma comunque il `gap` del form**
  (misurati 96px, 48 di troppo). Un item alto 0 conta come item → `display:none`, scoped alla veste
  (senza `impagina` il campo del tema è ancora là dentro e spegnerlo lo farebbe sparire).
  ⚠️ Persi due giri prima di trovarlo: `!important` con **un solo id perdeva** contro
  `#landing-view .glass-card #setup-form > div:not(:last-child){display:flex !important}` di
  style.css — l'ha detto `CSS.getMatchedStylesForNode`, non il ragionamento; e una **`*/` di troppo**
  faceva scartare in silenzio la regola che seguiva.
- **Due ritocchi di Giacomo, subito dopo la prova**: (a) il **pallino della Cabina** passa da
  `#989898` a `--man-card` `#f1f4f8` — e si **inverte** come il rail (puntino `#404040`, **9,4:1**,
  bianco quando il fondo diventa viola al passaggio o col fuoco da tastiera): era l'ultimo pezzo
  fuori dal token unico dei bottoni a riposo, e `--man-grigio` ora non lo usa più nessuno;
  (b) in **vista compatta il bottone del Dev self-test è sempre nascosto** — la regola sta su
  `.mappai-ridotta` in `mappai-modal-tokens.css` e non nella veste, perché la vista compatta esiste
  anche col manifesto spento. Verificato in Electron: nascosto in compatta, 44×44 nella vista
  completa, di nuovo nascosto al ritorno.
- **Aperte, sono decisioni di Giacomo**: il nome del file compare **due volte con due unità** (465 KB
  in tabella, «(0.5 MB) pronto» nella riga della fonte — toglierlo cambia `app.js:1100`, condiviso
  con la UI storica) · in vista ridotta senza file «Documenti» è largo 1240 e si stringe a 340 col
  file · **il centro di COSTRUISCI è ancora la pelle vecchia** (focus e lenti, impostazioni
  generazione, stima costi): in vista ridotta non si vede, nella vista piena sta in mezzo a due
  pezzi nuovi · `#mp-estimate` non è montato · nella barra della mappa il chip non c'è.

**Round 11 (4/8) — le CONSOLE prendono la veste manifesto (Cabina + INSEGNA).**
Dal disegno `Inkscape/console cabina profilo insegnante.pdf`. **La console smette di essere una
finestra sopra l'app e diventa la schermata**: testata a tutta larghezza col marchio, e sotto — in
fila — rail | colonna | area. Suite **998/0/2**, 0 errori console. Dettagli in
[`docs/HANDOFF-manifesto.md`](docs/HANDOFF-manifesto.md) §9.
- **File nuovi**: `public/css/mappai-console-manifesto.css` + `public/js/mappai-console-manifesto.js`,
  scoped `html.manifesto` e alle sole console a schermo pieno (i modali normali non cambiano).
  Una riga in `mappai-cabina.js`: via l'intestazione «Io» dal primo gruppo.
- **Non è stato ridichiarato niente dei pezzi interni**: riquadri chiari col titolo in maiuscoletto,
  pillole lilla, «+ Aggiungi …» tratteggiato, nota di aiuto, azione in basso a destra — c'erano già
  in `mappai-modal-tokens.css` e il disegno li conferma. Il delta era la CORNICE.
- **Il pallino della testata è l'uscita** (decisione di Giacomo: ESC oppure il pallino): viola 44px
  col segno bianco, al passaggio **e col fuoco da tastiera** diventa emerald e il segno si riduce a
  un puntino (misurato: `#41e6aa` esatto, puntino `#0b0b0b`). La **× sparisce**; `title`/`aria-label`
  passano sul pallino. Porta `data-azione="__chiudi"`, cioè la stessa strada della × — nessuna
  seconda via d'uscita da tenere allineata. Su una console `sporco` apre la conferma, e il rail
  resta sotto quella conferma.
- **Tetto di larghezza `--mnc-max: 1240px`** centrato, lo stesso numero della landing, su OGNI figlio
  diretto dell'area (se valesse solo per i riquadri, una tabella accanto partirebbe da un'altra riga
  verticale). Fasce bianche ai lati: scelta di Giacomo.
- 🐛 **Il rail spariva sotto la console**: un numero fisso nel foglio non basta, il piano lo assegna
  il motore a runtime (`prossimoZ()` +100 a ogni finestra) e la console si era aperta a 12100 col
  rail a 12050. Ora il JS legge il piano vero e mette il rail **un gradino sopra** — sopra la
  console, sotto qualunque finestra aperta da lì.
- 🐛 **La maniglia finiva in mezzo alla colonna**: `left` di un elemento assoluto si misura dal bordo
  interno del contenitore e **ignora il padding**, quindi il posto lasciato al rail non veniva
  contato (centro a 272 invece che a 354).
- **Aperte**: il sottotitolo della testata è rimasto (nel disegno non c'è, ma in INSEGNA è l'unico
  posto dove si legge su che cosa si sta lavorando) · la **tela dei documenti ora è capata a 1240**
  e non più da bordo a bordo (rovescia la decisione del 2/8 su F2).

**Round 11-bis (4/8) — i tre rilievi di Giacomo sulla console.**
1. **Il pallino della testata è il bottone della CABINA, non il marchio della console**: fuori dalla
   Cabina è grigio `#f1f4f8` col puntino `#404040` e ci porta (viola col puntino bianco al passaggio
   e col fuoco); dentro la Cabina resta viola con la sua icona e cliccarlo esce. Da una console
   non-Cabina si esce con ESC o scegliendo un'altra forma nel rail.
2. 🐛 **Il rail non marcava INSEGNA**: entrando nella console la landing sotto va su COSTRUISCI
   apposta (è dove si atterra chiudendola) e quel dettaglio interno finiva nel rail — testata
   «Insegna», rail «Costruisci». Ora chi apre una console dichiara la sua **sezione** e `modo()` la
   preferisce; con la Cabina aperta nessuna forma è accesa (non è una modalità di lavoro).
   ⚠️ La sezione sta sul **VELO** e non sul riquadro: `ridisegna()` costruisce un riquadro NUOVO e
   sostituisce il vecchio dentro il velo — e INSEGNA si ridisegna da sola a fine scansione dei
   vault, quindi il dato spariva sempre.
3. **«In ELABORA il documento non apre l'editor» non era un difetto**: l'editor si apre (provato).
   Quella era la console INSEGNA, dove il documento si apre in sola lettura (Stampa · QR · Finder);
   a far credere il contrario era il rail del punto 2. Aperto: se le righe dei materiali in INSEGNA
   debbano avere anche «Modifica» che salta all'editor di ELABORA.
- ⚠️ **`npm test` è `node --test` dalla radice** e scopre anche `MappAI - misuratore/tests/`: il
  totale oscilla (1000 → 1019) perché alcuni test del misuratore sono condizionati ai dati su disco.
  Il numero che conta è **0 fail** — citare «998» come costante è fuorviante.

**Round 12 (5/8) — i CONTROLLI GRANULARI del modulo: si compone anche quello che sta DENTRO
il riquadro.** Quattro leve chieste da Giacomo, tutte nel DATO
(`public/js/mappai-bento-composizione.js` → `m.layout` e `m.bottoni`), nessuna nel foglio: il CSS
legge, l'Officina §7 compone, il validatore dice cosa costa. Suite **1090/0/5**, 0 errori console.
Dettagli e misure in [`docs/HANDOFF-manifesto.md`](docs/HANDOFF-manifesto.md) §12.
- **Colori dei bottoni interni** (fondo · testo · le due tinte al passaggio) con **due badge di
  contrasto** accanto — è la leva nata dal difetto dei bottoni a **1:1** sui box scuri.
  ⚠️ Il contrasto si misura sul fondo **composito**: quei bottoni non hanno un fondo proprio, il
  foglio ne dà uno al 14% del colore del testo. Nuova `componi(fondo, tinta, %)` pura e testata —
  bianco al 14% su `#404040` fa **`#5b5b5b`**, il fondo già misurato ieri. Senza, il badge mostrerebbe
  un numero che a schermo non esiste: è il motivo per cui l'1:1 era passato inosservato.
- **Posizione delle etichette** (a sinistra / sopra) e **colonna che le allinea** (px): con le
  etichette a sinistra ogni riga partiva dove finiva la SUA etichetta — «Chi:» e «Cosa:» si
  allineavano solo perché lunghe uguali. Misurato nell'app: colonna 110px → i due campi del box
  giallo partono **entrambi a x=272**.
- **Disposizione delle voci** (auto · in colonna · 1-6 per riga) e **larghezza minima di colonna**
  (il `minmax(220px)` che stava scritto nel CSS). Accanto al campo compare **la larghezza che ne
  risulta**, rossa sotto i 120px: la disposizione si sceglie guardando lo spazio, non le voci.
- **Regola che tiene tutto**: si emette SOLO ciò che è stato scelto. `presentazione(m)` — una
  funzione sola per app e anteprima — dà variabili e attributi, e le regole nuove sono agganciate a
  un ATTRIBUTO: un modulo senza scelte non le incontra nemmeno. Verificato: composizione del file →
  **0 attributi** e tutte le misure di ieri invariate (221×4 · 145×6, griglia 232px, nessuno sbordo).
- Il **layout entra nella FIRMA**, i colori dei bottoni no: la disposizione è struttura, una tinta è
  un ritocco (stessa regola già valida per fondo e testo del modulo).
- ⚠️ **Difetto del banco, e non piccolo**: l'anteprima dell'Officina **non riceveva le regole nuove**.
  Il foglio ha due famiglie di selettori — le vecchie da `.manifesto` (bastava la classe sul
  contenitore), tutte quelle dal 5/8 da **`html.manifesto`** — e l'`<html>` dell'officina non aveva
  la classe: il banco mostrava una disposizione **che a schermo non esiste**. Classe spostata sul tag
  HTML (verificato innocuo: 81 campioni `.mm-*` invariati) e anteprima allineata alle classi dell'app.
- ⚠️ Con le etichette **sopra**, il `flex-basis` della colonna diventa un'**altezza** (etichetta alta
  90px): «non ha effetto» deve voler dire *niente*, non una resa rotta → `:not([data-et="sopra"])`.
- ⚠️ **Backtick in un commento del template literal di `build.js`**: terza volta che chiude la
  stringa e fa morire il build su una riga di prosa.
- **Aperto (non di oggi)**: nel box FOCUS le pillole delle Lenti portano **quattro corpi** oltre i tre
  della scala (10/600 ×12 · 11/700 ×6 · 13,2/400). La regola che uniforma i testi degli elementi
  spostati copre `span`/`p`/`label`, e quelle non sono nessuno dei tre. È una riga, ma schiaccerebbe
  corpi che qualcuno potrebbe volere: decisione di Giacomo.

**Round 13 (5/8) — la PRIMA SEZIONE entra nella composizione, e l'elenco delle fonti diventa uno
solo.** Rilievo di Giacomo: «in officina vedo una cosa diversa da quella che vedo in app». Era
strutturale: upload · elenco · MM/KG · opzioni erano impaginati da `RIGHE`, fuori dal dato — il banco
mostrava 10 moduli, l'app 14 pezzi. Suite **1094/0/5**, 0 errori console.
- **Quattro moduli NUDI**: `nuda` non vuol più dire «è un bottone» (quello lo deduce `soloAzioni`) ma
  **senza riquadro** — fondo, raggio e altezza modulare ce li ha già il pezzo accolto. Span 2+2 e 1+3,
  gli stessi delle righe storiche: a schermo non cambia un pixel, cambia dove è scritto. Misurato:
  `611 @134` · `611 @759` · `299 @134` · `924 @447`, tutti **145**, passi **14 · 14 · 14**, e il
  bottone «Documenti» tiene la sua veste (fondo `#f1f4f8`, raggio 16, icona 44, etichetta 15/700).
- ⚠️ `impagina()` costruisce le righe storiche **solo per i pezzi che il bento non ha preso**
  (`nelBento()` interroga il dato): senza, resterebbe un contenitore che aspetta un pezzo già preso —
  la trappola dell'item alto zero, quarta volta.
- **Un elenco solo per tutte le fonti** (decisione di Giacomo): PDF, link, YouTube, audio e testo, una
  riga ciascuno col pallino. Il CAMPO dove si incolla resta nel box «Fonti caricate»: lì si scrive,
  nell'elenco si vede l'inventario. Il genere lo dichiara il titolo che `addSource` già scrive →
  nessuna seconda lista di tipi. Verificato con fonti vere e con l'eliminazione (2 righe → 1).
- ⚠️ **Difetto preesistente**: in vista compatta ogni modulo-strumento cresceva di **24px** — la
  regola che riaccende i figli del posto accendeva anche l'etichetta della voce, spenta da
  `.mn-str--pieno` ma perdente in specificità (18px + 6 di gap). Ora 145 in entrambe le viste.
- ⚠️ **Un modulo nudo non è mai nascondibile**: senza stile prenderebbe il fondo scuro di base e
  finirebbe nella vista estesa — la schermata d'ingresso resterebbe senza il bottone del PDF.
- ⚠️ Il file `mappai-bento-composizione.js` è cambiato **sotto** durante la sessione: c'è ora un campo
  `forma` sulle voci strumento che **nessuno legge**. Lasciato e usato per le voci nuove; se serve va
  collegato, altrimenti è un campo che invecchia.

**Round 14 (5/8) — i DUE box delle fonti: l'elenco e l'area dove si scrive.** Dai rilievi di Giacomo
sugli screenshot dell'officina; adottata la sua bozza (upload 1 + elenco 3 · azioni 3 · colonna
etichette 45px sul giallo). Suite **1095/0/5**, 0 errori console.
- **Un box faceva due mestieri**: «Fonti caricate» mostrava l'elenco E dava il posto dove scrivere,
  con schede alte tre righe là dove accanto, per i PDF, c'era un elenco. Ora sono due: **Elenco delle
  fonti** (righe con la veste ESATTA dell'inventario: fondo trasparente, raggio 0, imballaggio 0,
  gap 10, pallino 20px; il genere passa in coda come dettaglio, la riga di spiegazione sparisce) e
  **Testo** (span 4, fondo bianco, testo `#404040`). Misurato: inventario `h 20` · riga-fonte `h 31` —
  l'unica differenza è il campo da compilare, che sotto i 26px non si tocca.
- **`raccoglie`: terza forma di montaggio.** Un posto normale *sposta* un elemento che c'è già; la
  riga del testo libero nasce quando si preme «Testo», cioè dopo e più volte → il posto dichiara
  `raccoglie: 'textarea'` e `raccogliRighe()` gliela porta appena compare. ⚠️ Sicuro perché `app.js`
  cerca le fonti con `document.querySelector('[data-source-id]')`, nel documento intero.
- **La crescita fino a 30 righe la fa il CSS**: `field-sizing: content` (Chromium 148) fra
  `min-height` e `max-height`. Misurato: 3 righe → 90px · 40 righe → **540px** che scorre · 60 → 540.
  Tetto dichiarato in RIGHE, non in pixel.
- L'inventario cerca le fonti **nel documento** e l'ascolto del digitato è **delegato al documento**:
  la riga del testo vive fuori da `#sources-container`, e con un ascolto legato al contenitore
  l'elenco resterebbe fermo a «0 parole».
- Nome del file nell'inventario da 700 a **600**: era un quarto corpo (12/700) accanto ai 12/600.
- ⚠️ **Ricascato nella trappola delle transizioni congelate**: la textarea si misurava **bianca su
  bianco** e ho dato la colpa alla specificità. A pannello nascosto le transizioni restano ferme sul
  frame di partenza e `getComputedStyle` serve quel colore — tanto che **nemmeno uno stile inline
  `!important` cambiava la misura**, che è il segno inequivocabile. Spente le transizioni:
  `rgb(64,64,64)`, giusto dal principio. Regola: **quando nemmeno l'inline vince, non è la cascata —
  è la misura.**

**Round 15 (5/8) — switch INTERI, pop-up su tutto (950ms), e il bordo di troppo.** Suite **1100/0/5**,
0 errori console. Dettagli in [`docs/HANDOFF-manifesto.md`](docs/HANDOFF-manifesto.md) §12.
- 🐛 **Gli switch arrivavano a METÀ**: le voci puntavano al singolo bottone (`#multipass-on`), non
  alla riga, quindi nel bento finiva una faccia sola dell'interruttore — senza il nome della cosa che
  governa e senza il suo `data-tip`. A schermo si leggeva «ON», «MappAI», «Automatica», «A», cioè
  **valori, non comandi**. Ora si monta la RIGA (`#row-multipass` · `#row-mm-logic` · `#row-kg-logic` ·
  `#row-gen-depth`, id nuovi in index.html): arrivano etichetta, entrambe le facce e la spiegazione
  che il markup già portava.
- **Le due profondità si distinguono dal nome** (era il rilievo di Giacomo): «MindMap: come
  costruisce i rami (MappAI · **Adattiva**)» = *come*; «**Profondità**: automatica o scelta a mano» =
  *quanto*. L'aiuto della seconda dice anche che NON è «Mostra fino a» (filtro di vista) — c'è il test.
- **Pop-up informativi su tutto**: tutte e **50** le voci dichiarano `aiuto`, il renderer lo mette come
  `data-tip` su spunte, campi, azioni e posti (misurato: 43 elementi col fumetto, **0 opzioni senza**),
  e il testo **si riscrive in officina** accanto all'etichetta. `seFuori` resta un campo a sé: risponde
  a un'altra domanda. Attesa **950ms** dichiarata (`ATTESA` in `MappAITips`), con test che la legge
  dal codice — senza, passando il mouse per arrivare altrove si accendeva una spiegazione dopo l'altra.
- 🐛 **Il fumetto poteva restare invisibile per sempre**: `showTip` posizionava dentro un
  `requestAnimationFrame`, che non scatta a finestra non in primo piano. Posizionamento **sincrono**
  (stessa cura già applicata in `mappai-a11y.js`).
- **Il bordo grigio attorno alla textarea** era il fondo al 14% dei pezzi spostati: quattro classi
  contro tre e vinceva lui → pareggiate. Via anche il titolo interno «Testo Libero» in un box che si
  chiama «Testo».
- **Officina**: due leve nuove per VOCE (pop-up · etichetta sempre visibile, per i pezzi che mostrano
  un valore) e il bollino rosso «senza aiuto». Restano NON componibili, ed è dichiarato: raggio e
  ombra del riquadro, passo fra le voci, taglia delle icone, «vai a capo» fra le righe.
- ⚠️ Nel pannello i `setTimeout` sono strozzati a ~1/s (950ms si misurano ~2000) e le transizioni
  restano congelate: verificato quello che si può — non compare all'istante, e torna a zero uscendo.

**Round 16 (5/8) — i due box senza titoli: elenco che scorre, aree di scrittura nude.** Suite
**1100/0/5**, 0 errori console.
- **Niente titoli**: l'etichetta del posto non si nasconde col foglio, **non si emette** (`nascondiEt`
  sulla voce) — quello che non c'è non può ricomparire per una regola più forte, ed è già successo.
  Il nome resta nell'inventario dell'officina, dove serve a sapere cosa si trascina. Via anche i
  titoli di riga: il segnaposto del campo dice già di che fonte si tratta.
- **L'elenco scorre**: riquadro a 145 come gli altri, righe che scorrono (misurato: contenuto 107 su
  99 visibili, ultima riga raggiungibile).
- **Box del testo**: una casella bianca **per ogni clic** su «Testo», nessun titolo, **nessun
  segnaposto**, un **cestino da 22px** per blocco (rosso al passaggio e col fuoco). Ogni area cresce
  per conto suo (90 · 232 · 90 px con 1, 12 e 0 righe). ⚠️ Il segnaposto si svuota solo nella copia
  dentro il bento (`data-ph` conserva l'originale): è lo stesso campo della UI storica.
- 🐛 **«Non scorre» era altro**: le quattro fonti stavano **affiancate** su una riga alta 43px. La
  regola che compatta i pezzi spostati impone `flex-direction: row !important` a ogni figlio diretto
  del posto, e un `!important` batte qualunque regola che non ce l'ha — **anche con due id contro
  uno**. La compattazione vale per un bottone; un contenitore di righe è l'eccezione, ora dichiarata.

**Round 17 (5/8) — l'Officina allineata, e il buco che l'aveva resa inutile per un giro.** Suite
**1104/0/5**.
- 🐛 **`vociDi()` copiava a mano solo `et` e `w`**: con due leve per-voce andava; alla terza (pop-up)
  e alla quarta (titolo del posto) è diventata una lista da tenere allineata, e si è rotta **in
  silenzio** — la scelta finiva nel dato, l'officina mostrava di averla presa, e **chi disegna non la
  vedeva mai**. Ora copia tutti i campi scritti sulla voce (+ test di regressione).
- **Titolo del posto = UNA leva a tre stati** (`titoloPosto`: auto · sempre · mai) al posto di due
  booleani opposti (`mostraEt`/`nascondiEt`) nati a due giorni di distanza. I flag restano leggibili
  per non invalidare le composizioni salvate.
- **L'anteprima dell'officina segue la stessa regola**: prima mostrava un titolo che a schermo non
  c'è. Verificato nel banco e nell'app (etichetta emessa con «sempre», `data-tip` = l'aiuto riscritto).
- ⚠️ **Un SECONDO processo scrive sugli stessi file**: durante il giro sono comparsi `forma`/`formaDi`
  e in officina `disegnoStrumento()` (sagome dei controlli) che non ho scritto io. Non toccati. Due
  sessioni sullo stesso file si sovrascrivono: qui è andata bene perché le modifiche non si toccavano.

**Round 18 (5/8) — la composizione di Giacomo adottata come default del repo.** Il JSON dell'officina
è ora quello scritto in `mappai-bento-composizione.js`: **8 righe**, tutte a quattro colonne (upload
1+3 · genere 1+3 · le quattro card 221 · giallo+azione · Modalità 145 · FOCUS 215 in colonna ·
INPUT+elenco 215 · Testo 215). «Adatta al livello» passa da FOCUS a Modalità (decide COME l'AI
scrive, non che cosa estrarre); il box Testo prende il titolo dal POSTO e non dal modulo.
Suite **1104/0/5**, 0 errori console.
- 🐛 **La scelta sul titolo sarebbe stata ignorata**: `titoloPosto` guardava i campi per TIPO, quindi
  `mostraEt` scritto sulla voce perdeva contro il `nascondiEt` dell'inventario — il box del testo
  sarebbe rimasto muto. Ora vale tutto quello che dice la VOCE, poi quello che dice l'inventario:
  chi compone deve poter rovesciare il default.
- 🐛 **Tre corpi in più** dai bottoni degli switch montati («OFF/ON», «MappAI/Adattiva», «A/B»): sono
  `<button>` e la regola che uniforma i testi degli spostati copriva solo `span`/`p`/`label` (con lo
  zoom della landing arrivavano a 14,4px). Aggiunto `button` → **tre corpi in tutto il bento**
  (12/600 ×82 · 14/700 ×11 · 15/700 ×5). La stessa riga ha chiuso anche i **quattro corpi delle
  Lenti**, che erano l'aperto dichiarato la mattina.
- Corretto il refuso «Profontià» → «Profondità» (etichetta a schermo) e riscritti tre `seFuori`
  allarmisti: «Apri Vault», «Apri JSON» e «Analisi» non montati **restano fra i tre avvii in fondo
  alla pagina** (l'analisi però resta spenta in vista compatta, e il campo ora lo dice).

**Round 19 (5/8) — i box del bento come nel banco: riga «etichetta · comando».** Rilievo di Giacomo
(due screenshot a confronto): in officina un modulo di strumenti è un elenco — nome a sinistra,
comando a destra — mentre in app i controlli veri arrivavano affiancati, con due barre di
scorrimento. Suite **1104/0/5**, 0 errori console.
- **Nel dato**: Modalità e FOCUS dichiarano `colonneVoci: 'colonna'` e tutte le voci portano il
  titolo. È quello SCELTO in officina, non quello che l'elemento si porta dietro («MappAI · Adattiva»
  dice più di «MindMap»; il primo figlio testuale dell'elemento montato si spegne, o sarebbero due
  nomi per la stessa cosa).
- **Nel foglio**: riga `space-between`; i controlli perdono le tinte di Tailwind (arancio · emerald ·
  indigo, scelte per fondo bianco) e prendono il fondo dei bottoni del modulo. Misurato: Modalità
  291px e FOCUS 371px, **nessuno dei due scorre**, zero scorrimenti orizzontali, tre corpi.
- ⚠️ **Inseguito un numero per tre giri, ed era la domanda sbagliata**: alzavo l'altezza e il
  contenuto cresceva con lei (172 → 179 → 190), perché le righe si allungavano nello spazio libero.
  La regola giusta è **un box in colonna prende l'altezza del contenuto** (`max-height: none`), con
  `altezza` che torna a essere un minimo: niente da rimisurare quando si aggiunge una voce.
- 🐛 **«Macro-aree a mano» montata e inerte**: `#step-l1-wrap` sta nella lista dei contenitori
  RESIDUI **ed è** la voce montata → la funzione che spegne i residui spegneva il pezzo. Ora un
  contenitore dentro `#mn-bento` non è un residuo. Acceso, portava il pannello intero (294px) e FOCUS
  saliva a 525 → una riga non supera **140px** e il pannello scorre dentro la riga (⚠️ il tetto NON
  vale sui moduli nudi, dove il pezzo è il modulo: li schiacciava da 145 a 140).
- **Aperto, decisione di Giacomo**: la voce «Lenti» monta `#lenses-panel`, che nel markup è
  dichiarato NASCOSTO (col suo bottone dentro un contenitore `hidden`): montarla non la riaccende.
  O si riattiva la funzione, o la voce esce dalla composizione.

**Round 20 (5/8) — i toggle dicono le due scelte, non un valore.** Richiesta di Giacomo: il testo
delle due facce dentro l'interruttore. Suite **1104/0/5**.
- **Single · Multi** (era OFF/ON) · **Normale · Adattiva** (era MappAI/Adattiva) · **KG A · KG B**
  (era A/B). Pillole allargate a 132 e 124px: «Single» non stava in 72 (misurato, zero troncamenti).
- ⚠️ Rinominare una faccia rende **incoerenti le etichette che la citavano**: la voce si chiamava
  «MappAI · Adattiva» → ora **«Costruzione dei rami»**, e «Pipeline KG:» → «Pipeline» (con le facce
  che dicono già KG). Aggiornati anche i tre `data-tip`/`tip_mm_logic` nei due dizionari, che
  parlavano ancora di «MappAI: costruzione classica».
- 📌 **«Adatta al livello»** (`MappAITune.levelArmed`, `#level-tune-row`) inietta nel prompt il blocco
  «--- LIVELLO DI LETTURA ---» col grado e l'ordine scolastico del contesto attivo. È il fratello
  minore della **taratura piena [VERDE]** (`MappAITune.armed`, registro + note della classe, che
  marca il file col suffisso): quella è «scrivi come per questa classe», questa è solo «scrivi per
  chi ha quell'età». Nel modale/bento della pipeline lo stesso concetto si chiama **«Adatta alla
  classe»** (`mp-adapt-on`) — due nomi per due gradi della stessa cosa.

**Round 21 (5/8) — «Adatta», i due chip+pallino e i default del bento.** Suite **1104/0/5**, 0 errori
console. Modalità passa a **1 colonna** (299px) e FOCUS a **3** (924px), come chiesto: nessuna
etichetta troncata, nessuno scorrimento.
- **«Adatta al livello» → «Adatta»**, col pop-up dettato da Giacomo. Rinominata anche l'etichetta
  storica nel markup e nei due dizionari (`ui_level_tune`).
- **Chip + pallino** per i due comandi a UNO stato (`#level-tune-toggle` e `#auto-depth-toggle`):
  46×26, pallino 18px, **rosso da spento · emerald da acceso**. Il colore sta sul PALLINO, non sul
  chip: il chip è il binario, il pallino è lo stato. ⚠️ `syncAutoDepthUI` accende `bg-emerald-400`
  sul bottone: dentro il bento va neutralizzato, o il chip direbbe la stessa cosa due volte.
- **Default**: Adattiva · Multi · Profondità automatica ON · Adatta ON · KG A.
  ⚠️ Non basta «applica se la chiave è vuota»: `mappai-storage-lang.js` al boot scrive già un default
  suo (**pipeline = B**), quindi quando il bento gira non esiste più niente di «mai scelto». Serve un
  marcatore proprio (`mappai_bento_default_v1`): i default si applicano UNA volta, poi comanda la
  scelta dell'utente.
- ⚠️ **«Adatta» è DISABILITATA finché non c'è un contesto attivo** (senza classe o allievo non c'è un
  livello a cui adattare, e `levelBlock()` tornerebbe vuoto): il default la accende solo quando si
  può, e `sincronizzaBento` ripassa a ogni scelta nel box giallo — verificato, appena la riga si
  riabilita diventa accesa e `levelArmed` true. Da spenta-per-forza il pallino è **grigio**, non
  rosso: il rosso vuol dire «spento», non «non disponibile».
- ⚠️ Nota di procedura: **rimuovere `#mn-bento` cancella gli elementi VERI** che ci vivono dentro
  (li ho persi in una prova). Il bento si monta una volta sola e non si smonta: non è un rischio del
  flusso normale, ma chi prova a mano deve ricaricare la pagina, non rimontare il bento.

**Officina riallineata (5/8, dopo il round 21).** `node tools/officina/build.js` non basta: il banco
è aggiornato quando **disegna quello che l'app fa**. Due divergenze chiuse.
- **`forma` di «Profondità automatica» era `segmento`**, ma da oggi è un chip+pallino: ora dichiara
  `interruttore`, e la sagoma nell'anteprima cambia di conseguenza. Il campo `forma` (aggiunto da un
  altro processo) governa il disegno del banco: se un controllo cambia veste, va aggiornato lì.
- **La sagoma dell'interruttore aveva misure sue** (26×15, pomello bianco a sinistra): era *un'idea*
  di interruttore, non QUESTO interruttore. Ora porta le misure vere — **46×26, pallino 18 a destra,
  emerald**, cioè lo stato acceso, che è il default di entrambi.
- Verificato nel banco (origine pulita): 15 moduli · Modalità span 1 con le cinque voci **in
  colonna** · sagome giuste · 19 leve «titolo» · 37 campi «aiuto» · **0 voci senza pop-up** · 0 errori
  di diagnosi e 0 errori console.

**Round 22 (5/8) — la composizione con Modalità e FOCUS sulla stessa riga.** JSON di Giacomo adottato:
**7 righe**, e le due colonne che prima stavano una sotto l'altra ora condividono la riga 5
(**modalità 1 + FOCUS 3**). Suite **1104/0/5**, 0 errori console.
- **`titoloPosto: 'mai'` dove il pezzo porta già il suo nome**: «Generazione Multi-Pass», «KG (A/B)»,
  e le quattro voci di FOCUS. Il titolo resta solo dove il pezzo mostra un VALORE o un chip
  («Adattiva», «Profondità automatica», «Adatta linguaggio»). Verificato leggendo i testi
  **visibili** (⚠️ `textContent` legge anche ciò che è `display:none`: la prima misura sembrava piena
  di doppioni che non c'erano).
- Misurato: Modalità `299 @134` · FOCUS `924 @447`, **stessa riga**, 341px entrambi, nessuno
  scorrimento, nessuno sbordo.
- ⚠️ **Un doppione vero resta**, ed è una scelta da rivedere: il titolo della prima riga è
  «**Adattiva**» e la faccia attiva dello switch si chiama **Adattiva** — la stessa parola due volte
  nella stessa riga. Il titolo dovrebbe dire *di che cosa* si sceglie (era «Costruzione dei rami»).
- ⚠️ La riga «Lenti» resta **vuota**: il pannello è nascosto nel markup (decisione vecchia), e la
  scelta su che farne è ancora aperta.

**Round 23 (5/8) — KG torna a B, via il titolo doppio, e le LENTI si vedono.** Suite **1104/0/5**,
0 errori console.
- **KG = B** (scelta di Giacomo, rovescia il round 21): la riga che forzava «A» è tolta dai default
  del bento — B è già il default storico che `mappai-storage-lang.js` scrive al boot.
- **Via il titolo «Adattiva»**: `titoloPosto: 'mai'` su `mn-mmlogic`, come per Multi-pass e Pipeline.
  La riga ora dice **«MindMap · Normale · Adattiva»**: un nome solo, quello del markup.
- 🐛 **Le Lenti**: il pannello era **già montato e già pieno** (13 lenti in 3 gruppi) — restava
  invisibile per la classe `hidden` del markup, cioè lo stato «collassato», e il bottone che lo
  apriva («▸ Personalizza extraction lenses») vive in un contenitore dichiarato NASCOSTO che è
  rimasto FUORI dal bento. Dentro il bento non c'è niente da collassare: il pannello È il pezzo di
  quel posto → `display: block !important` scoped a `#mn-bento`. Fuori dal bento la decisione
  storica non cambia. Misurato: 21 voci visibili, riga a 140 (il tetto), FOCUS 481 senza scorrere.
- 📌 **Perché il check della taratura non c'è, ed è giusto così**: la taratura si applica DA SÉ
  leggendo il profilo del contesto attivo. Per la MAPPA passa da `classTuningPrompt()` dentro
  `buildSystemInstruction` — nessuna spunta di mezzo; per i MATERIALI il modulo monta `mp-adapt-on`
  **nascosto e acceso** (verificato: `hidden`, `checked`), perché `_readConfig()` deve trovarlo.
  Chi ha assegnato preset e note a una classe le ha già decise una volta.

**Round 24 (5/8) — le MACRO-AREE hanno un box loro, col toggle «in automatico».** Composizione di
Giacomo: FOCUS resta a focus·lenti·disciplina, e le macro-aree escono in un riquadro a tutta riga
(**8 righe** in tutto). Suite **1104/0/5**, 0 errori console.
- 🐛 **`mn-l1` montava il contenitore SBAGLIATO**: `#step-l1-wrap` contiene anche il blocco del Focus
  specifico, che ha una voce sua — il box delle macro-aree si portava dentro «Focus specifico
  (Opzionale)» e nel form restava un'etichetta orfana. Ora monta `#input-l1-container`, che porta le
  macro-aree **e il loro toggle** «Genera Macro-Aree in automatico» (era già lì dentro: non serviva
  aggiungerlo, serviva montare il contenitore giusto).
- 🐛 **Il toggle finiva 18px sotto la piega**: il tetto di 140px per riga tagliava il pannello, e la
  decisione da cui dipende tutto il box si raggiungeva scorrendo. Ora **un riquadro con UNA sola voce
  prende l'altezza del contenuto** (il tetto serve a non far sfondare una riga fra tante, non a
  tagliare un pannello che ha un box tutto per sé). Misurato: 283px, non scorre, toggle visibile; gli
  altri box-strumento invariati.
- Il contenitore residuo del Focus nel form resta **spento** (verificato `display:none`): nessuna
  etichetta orfana.

**Round 25 (5/8) — composizione rimandata: quasi nessun titolo del posto in Modalità.** Quattro voci
su cinque passano a `titoloPosto: 'mai'` (il nome lo porta il pezzo: «MindMap», «Generazione
Multi-Pass», «Profondità di generazione», «KG (A/B)»); il titolo resta solo su «Adatta linguaggio»,
il cui pezzo mostra un chip e nient'altro. Suite **1104/0/5**, 0 errori console.
- ⚠️ **Le `et` delle voci con titolo «mai» non si vedono a schermo**: restano per l'inventario
  dell'officina, dove servono a sapere che cosa si trascina. Cambiare «Adattiva» in «(Normale ·
  Adattiva)» non cambia un pixel nell'app — è una nota per il banco.
- ⚠️ **L'altezza dichiarata (260) non morde**: un box in colonna prende l'altezza del CONTENUTO
  (misurato 333 per Modalità e FOCUS). `altezza` lì è un minimo che serve solo a non farlo collassare.
- Misurato: Modalità e FOCUS 333 sulla stessa riga, macro-aree 283, tre corpi tipografici, nessuno
  scorrimento, nessuno sbordo.

### 📄 HANDOFF (agg. 4/8/26): DUE punti di ripresa
- **[`docs/HANDOFF-manifesto.md`](docs/HANDOFF-manifesto.md)** — la VESTE nuova: landing manifesto,
  COSTRUISCI a due colonne, il **bento** delle opzioni al posto del modale, l'Officina §7 dove la
  composizione si trascina. Contiene le decisioni di colore da non ridiscutere, le sei cose da fare
  in ordine (la prima: **provarlo in Electron**, non ci è mai girato) e le otto trappole nuove.
- **[`docs/HANDOFF-console.md`](docs/HANDOFF-console.md)** — le console e il motore dei modali,
  che restano com'erano. I due filoni si toccano (chip, token, `.mm-tab-wrap`) ma hanno stati
  diversi: le console sono in produzione, la veste no.

#### Il precedente, per riferimento: [`docs/HANDOFF-console.md`](docs/HANDOFF-console.md)
**Punto di ripresa per la chat successiva.** Nato sulle console, ora copre anche la **landing**, che
è passata dallo stesso riordino. Contiene: dove siamo (con la suite e lo stato del repo), il motore
com'è oggi — pezzi, e per ciascuno il difetto da cui è nato — le regole da ricordare (fra cui: **una
azione che conclude non passa da `suAzione`**, e scriverla lì produce codice morto senza errori), le
due console in app, la landing (vuota all'avvio · header a due comandi · vista ridotta di
COSTRUISCI), le **8 cose da fare in ordine** col debito dichiarato, le **12 trappole** viste sul
campo e come lavora Giacomo. Da leggere prima di toccare qualunque superficie.

### ✅ FATTO (2/8/26): motore acceso + PRIMA superficie migrata (profilo insegnante)
Passi 0 e 1 dell'handoff. Suite **958/0** invariata (il core non cambia: cambiano il motore, che è
DOM, e i token). Tutto misurato nella pagina VERA servita a 1440×900, non su un banco.
- **Passo 0**: `mappai-modal-core.js` + `mappai-modal.js` caricati in `index.html` subito dopo
  `app.js` (regola 2). Verificato a pagina caricata: motore presente, **zero elementi `mm-*`** →
  nessuna superficie esistente cambia aspetto. Da qui un modale si porta sullo standard cambiandogli
  le classi, senza toccare CSS globale.
- **Tre buchi del motore chiusi** — venuti fuori appena una superficie vera ha provato a usarlo:
  1. **Le azioni interne chiudevano il modale.** `open()` chiudeva su QUALUNQUE `data-azione` non
     dichiarato: il «+» di un elenco, la × di una voce, una metà del chip di contesto, una cella di
     scelte. Cioè gli elenchi e il chip erano inusabili — si disegnavano ma al primo clic la finestra
     spariva. Ora conclude **solo un'azione dichiarata**; tutto il resto va a `suAzione`.
  2. **Navigazione e schede erano inerti**: nessun gestore leggeva `data-nav`/`data-scheda`. Ora
     emettono `__nav` / `__scheda` — senza questo nessuna console potrebbe cambiare vista.
  3. **Non esisteva un ridisegno.** `suAzione(ev, box, ridisegna, sorgente)`: `ridisegna(schemaNuovo)`
     rimonta sul posto e **rimette il fuoco dov'era**, riconosciuto dal ruolo dichiarato
     (`data-azione`/`data-campo`/`data-nav`/`data-scheda`), non dalla posizione — dopo aver aggiunto
     una sede la fila è più lunga e l'ennesimo bottone non è più lo stesso.
  - Aggiunto anche l'evento **`__campo`** sul `change` dei campi: un campo che cambia può cambiare il
    modale (scegliere «Docente di sostegno» apre una sezione che non c'era; scegliere Infomaniak
    chiede un Product ID). Senza, ogni schermata dovrebbe riattaccarsi al DOM da sé — cioè quello che
    il motore serve a non fare più.
  - ⚠️ **Difetto trovato misurando**: dopo il primo ridisegno i comandi interni morivano. `monta()`
    sostituiva lo `schema` con quello nuovo, e il nuovo non porta `suAzione`. Il gestore è
    **comportamento del modale aperto, non un dato**: ora vive in una variabile sua e un nuovo schema
    può sostituirlo, mai azzerarlo.
- **i18n nel motore** (era un finding dell'audit): «Annulla», «Chiudi», «Esci», «Togli», «Niente da
  mostrare», la conferma di uscita… passano da `t()` con l'italiano come ripiego inline; le chiavi
  `mm_*` vivono solo in `en_translations.js` (regola 13). Verificato IT→EN→IT sulla pagina vera.
- **Passo 1 — `mappai-teacher-profile.js` riscritto come SCHEMA**, col disegno della Cabina E1:
  sedi e materie sono **elenchi** (chi insegna in due istituti non deve più sceglierne uno e
  correggere a mano), **«Ora di classe»** sta fuori dalle materie (non ha contenuti disciplinari:
  dentro l'elenco l'AI la tratterebbe come una materia) e chiede la classe di riferimento solo a chi
  dichiara di averne una, **ruolo «Docente di sostegno / OPI»** è il gate dei profili individuali
  degli allievi (dati sensibili: si aprono dichiarando il ruolo che li giustifica).
  `MappAITeacherProfile.sezioni(S)` restituisce le sezioni → la console Cabina le monterà così come
  sono, senza riscriverle. Store esteso (`anno`, `oraDiClasseCls`, `ruolo`, `sostegnoEnte`); i due
  `…Mode` restano per il round-trip dei profili già su disco ma non governano più niente, e
  `sediList()`/`disciplineList()` ora restituiscono **tutte** le voci (con l'elenco non esiste più un
  «modo singolo» che ne nascondeva le altre). Chiavi `tp_*` orfane rimosse dal dizionario EN.
- **Misure** (pagina vera, 1440×900): riquadro 820×792 · bottoni corpo **14px**, bersaglio **49px** ·
  campi 16px Space Mono, **bordo trasparente** (decisione 31/7) · griglia a 2 colonne con «Ruolo» a
  tutta riga · **contrasti da 4,55 a 17,85 — tutti sopra 4,5** · aria-label su tutti i campi · i due
  radio nello stesso gruppo `mmg-ruolo` · ESC → conferma di uscita col fuoco su «Torna indietro»,
  **mai** sul distruttivo · fuoco restituito a `#btn-user-profile` alla chiusura · zero errori console.
- **Tre difetti dei token trovati misurando la prima superficie**, corretti in
  `mappai-modal-tokens.css` (una volta sola, per tutti i modali futuri):
  1. **bersagli sotto misura**: voce di elenco 35px, sua × **21×19**, «+» 35px, **la × di chiusura
     21×26** — la × è l'uscita, se c'è un bersaglio da non sbagliare è quello. Ora 44 / 32 / 44 / 44
     (il 32 della × sta dentro una voce da 44 ed è sopra i 24 di WCAG 2.2).
  2. **il piè spariva sotto il bordo** quando il modale supera 88vh (misurato: 792px al tetto): si
     compila un form senza vedere come si conclude. Piè **sticky** con sfumatura sopra, fuori dalla
     console (che ha già l'area con lo scorrimento suo).
- ⚠️ **Trappole ripetute e riconosciute**: il pannello browser parte con `innerWidth: 0` → `94vw`
  vale 0 e il riquadro si misura **44×44** (sembra un difetto, è il viewport: `resize_window` prima
  di misurare); e il CSS viene servito dalla **cache** → misure giuste su codice vecchio (ricaricare
  il foglio con marcatore prima di credere a un numero).
- ⚠️ **Da testare in Electron vivo**: profilo aperto dal bottone header vero, elenchi con
  sedi/materie reali, gate del ruolo, salvataggio e riapertura, ripercussione su form classi (tendina
  sede) e generazione (scelta disciplina), switch lingua EN.
### ✅ FATTO (2/8/26): Passo 2 — i modali della landing al motore, e l'archetipo «Elenco»
Suite **965/0** (+7 test). `makeOverlay` di `mappai-landing-teach.js` **non esiste più**: era un
overlay senza focus trap e senza ritorno del fuoco (finding dell'audit), rifatto a mano ogni volta.
- **Pezzo nuovo del motore: le VOCI** (`sezioni[].voci`). L'archetipo «Elenco» era ancora *da-fare*
  e i quattro picker della landing sono esattamente quello: **righe che si scelgono**. Il motore non
  lo sapeva disegnare, quindi chi le scriveva ripartiva da un `<button>` con lo stile inline.
  Una voce porta icona · titolo · seconda riga · badge in coda, e **si comporta come un bottone**
  (conclude, salvo dirlo); può avere comandi propri, che invece **non concludono** — si elimina un
  documento e l'elenco resta aperto. Le intestazioni `{gruppo:'…'}` non si cliccano e non contano
  come voci. Nel core: `normalizzaVoce` esteso, validazione (voce muta = errore, id ripetuto =
  errore, oltre 12 voci senza gruppi = avviso «diventa un muro»). CSS: `.mm-voci` / `.mm-voce`,
  riga da **56px** misurati. Il fuoco all'apertura si posa sulla **prima voce**, non sulla ×.
- **Migrati**: `pickClass` (voci delle classi + «Continua senza classe») · `pickMap` (fasce come
  intestazioni di gruppo, e «Mappe di altre classi» si apre col ridisegno invece che con un toggle
  di `display`) · `pickDoc` (comando Elimina per riga → conferma distruttiva → riga via, elenco
  aperto) · `editGrade` (gradi delle classi come bottoni brevi con la spunta su quello in uso, campo
  personalizzato, «Rimuovi grado» distruttivo isolato a sinistra) · `_openAssignModal` (le due
  tendine legate col `__campo`: cambiando classe la disciplina resta solo se la nuova classe la
  insegna; senza classe l'unica voce dice «— scegli prima la classe —», che spiega più di un campo
  grigio).
- ⚠️ **Difetto vero del core, trovato misurando**: **la normalizzazione non era idempotente.**
  `open()` normalizza e poi `render()` rinormalizza; alla seconda passata un'intestazione di gruppo
  non porta più il campo `gruppo` (è diventato `etichetta`) → tornava un **bottone cliccabile**.
  Riguardava anche la **navigazione delle console** aperte con `open()`: i mockup usano `render()`
  (una passata sola) e non l'avrebbero mai mostrato. Corretto + test che prova il no-op.
- ⚠️ **Secondo difetto dei token, generale**: i riquadri sono grid item e **mancava `min-width: 0`**
  → un testo che non va a capo (il nome lungo di una mappa) allargava il riquadro oltre il modale,
  che cominciava a scorrere in orizzontale. Misurato: riquadro **653px dentro un modale da 600**.
  Corretto su `.mm-sez` e sui figli di `.mm-body`/`.mm-body__main`/`.mm-console__sez`. Il
  suggerimento al passaggio ora copre anche `.mm-voce__n`/`.mm-voce__s` (verificato: 0 fumetti a
  400ms, testo intero a 1100ms, niente su una riga non troncata).
- **Verificato nella pagina vera** (1440×900): i cinque flussi end-to-end (classe → mappa, classe →
  materiale → pubblicazione, elimina con conferma, grado nei suoi quattro percorsi, assegna con le
  tendine legate), 0 sbordi, 0 errori console. Console E1 rimisurata dopo il fix CSS: **0
  troncature, 0 sbordi**, colonna 272. Pagine di `public/dev/` rigenerate coi loro script.
- ⚠️ **Trappola, di nuovo**: il pannello browser serviva i **JS dalla cache** anche dopo il reload
  forzato — girava il codice di prima. Per misurare bisogna rifetchare i moduli e rieseguirli
  (`fetch(..., {cache:'reload'})` + `eval`), altrimenti si misura codice vecchio.
- ⚠️ **Da testare in Electron vivo**: i tre avvii rapidi di INSEGNA (Lavagna · Live · Materiali),
  «Assegna classe e disciplina» con lo spostamento vero della cartella, il grado dai Progetti di
  COSTRUISCI, l'eliminazione di un materiale dall'archivio.
### 🐛 CORRETTO (2/8/26): «Elimina» non toglieva il file dalla cartella
Segnalato da Giacomo provando in Electron. Non era un'impressione: **il file restava sul disco**.
- `deleteDoc` toglieva la voce dall'**archivio in localStorage** (`MappAIStudyDocs.remove`) e basta.
  L'archivio non registra quali file siano stati scritti nel vault — sono due mondi che non si
  parlano (l'editor scrive con `saveVaultFile`, l'archiviazione avviene altrove).
- Peggio: le righe che vengono **dal disco** (`_disk: true`) avevano solo *Apri* e *Finder*.
  **Un file del vault non era cancellabile dall'app**, da nessuna parte.
- **IPC nuovo `delete-vault-file`** (main.js, + `deleteVaultFile` in preload): stesse guardie di
  `save/read-vault-file` (`FilesCore.sanitizeVaultRelPath`) più il vincolo che il vault stia sotto
  `Mappe`, rifiuto delle cartelle, e **`shell.trashItem` come `delete-vault`** — un materiale di
  classe si recupera dal Cestino, non si cancella e basta.
- **Cestino sulle righe da disco** in Materiali e in Quiz cartacei, con la conferma a digitazione
  del nome esatto (regola §10.15). `deleteDoc` resta com'era ma il commento dice la verità: toglie
  la voce, non il file — «elimina» che lascia il file nella cartella è una bugia.
- **`confirmDeleteText` passata al motore**: la conferma a digitazione di TUTTE le eliminazioni
  della landing ora è un modale `mm-*` (fuoco nel campo, mai sul distruttivo, ESC, ritorno del
  fuoco). Ripiego su `showPrompt` se il motore manca.
- ✅ Verificato in browser con IPC finto: cestino presente sulla riga da disco, conferma col nome
  giusto → `{vaultPath, relPath}` corretti, **nome sbagliato → zero chiamate**, 0 errori console.
- ⚠️ **Da testare in Electron vivo**: il file sparisce davvero dalla cartella e finisce nel Cestino.

### ✅ FATTO (2/8/26): console «INSEGNA» + la barra unica dei documenti
Suite **972/0** (+7). Scelte di Giacomo: la console **sostituisce** le tre sezioni; il documento si
apre **nella tela**. Kill-switch `mappai_teach_console='0'` → landing storica.
- **`mappai-doc-bar.js`** (UMD, puro, +6 test): la topbar dei documenti stampabili, **una sola**.
  Era copiata in sei file con tre glifi stampante diversi e **le emoji nei bottoni** (🖨 ✕, contro
  la regola: solo Lucide) — finding di gravità alta dell'audit. Icone **SVG in linea** (tracciati
  Lucide): in una finestra `window.open` non c'è `lucide.createIcons()` da chiamare.
  ⚠️ **I token `--mm-doc-*` vivono QUI, non in `mappai-modal-tokens.css`**: la barra sta per metà
  in finestre che NON caricano il CSS dell'app; se i token stessero nel foglio, la finestra
  dovrebbe riscriverseli e da lì ricomincerebbero a divergere. `QP_PRINT_BAR` ora la richiama
  (quiz e flashcard); gli altri quattro cloni restano da migrare.
- **La console** (in `mappai-landing-teach.js`, `MappAITeach.openConsole`): chip **classe · materia**
  in testata → la colonna elenca **solo le mappe di quel contesto** (è il difetto che Giacomo aveva
  segnalato: scegliere la classe non restringeva niente) → scelta la mappa, l'area mostra gli avvii
  con la classe e **i materiali del suo vault**, archivio e disco **insieme** (due mondi che non si
  parlano: qui si vedono nello stesso elenco) → il materiale scelto entra nella **tela** in un
  iframe, con la barra al posto dei filtri: Indietro · Stampa · QR · Finder.
  Le viste della classe (Attività · Quiz cartacei · Lavagna) riusano nella tela le tabelle che la
  landing già disegna — riscriverle sarebbe due tabelle da tenere allineate.
  ⚠️ **«File condivisi» resta fuori**: il suo contenitore non esiste (`renderSharedMat` senza
  `teach-shared-body`, l'orfano dell'audit). Una voce che porta a una vista vuota è peggio di una
  voce che non c'è. Le viste ospitabili stanno in `VISTE_CLASSE`, fonte unica id→contenitore.
- **Due pezzi nuovi del motore**, nati da difetti visti a schermo:
  1. **ESC a strati.** `suAzione` riceve `__esc` e rispondendo `false` dice «l'ho gestito io»: nella
     console il primo ESC chiude il documento, il secondo la console. Prima il primo ESC buttava
     via tutto il posto in cui si stava lavorando.
  2. **Bottoni di sola icona** (`soloIcona`): tre «Elimina» rossi in fila dominavano un elenco in cui
     l'azione vera è *aprire*. Ora il cestino è **44×44, grigio, rosso solo al passaggio**.
     L'etichetta non sparisce: diventa `aria-label` + fumetto — è la condizione per averlo, visto
     che l'audit aveva contato 26 bottoni solo-icona muti.
- ⚠️ **Difetto mio, trovato al primo clic**: le voci **concludono** per default (giusto in un picker),
  quindi scegliere un materiale **chiudeva la console**. Dichiarato `chiude:false` sulle voci.
- **Verificato nella pagina vera** (1440×900): console piena 1434×900, chip che filtra (2 mappe su 3,
  poi 1 scegliendo Storia), materiali 4 = 2 archivio + 2 disco, documento nell'iframe (tela
  1162×741), ESC a strati, maniglia che chiude la colonna, eliminazione di un file dal disco
  (`relPath` giusto) e conferma col nome. **Validatore: 0 errori e 0 avvisi su tutti e quattro gli
  stati** della console. 0 errori console.
- ⚠️ **Da testare in Electron vivo**: apertura di un PDF vero nella tela (data-URI), Stampa
  dall'iframe, QR di un materiale HTML dal disco, gli avvii con la classe, le tre viste della classe.

**Round 2 (2/8, dai tre rilievi di Giacomo in Electron).** Suite 972/0.
1. **Le mappe vengono dal DISCO, non da localStorage.** Era il difetto vero: «l'unica classe in cui
   vedo tutti i materiali del vault è 2A di Storia». Partivo dai progetti salvati e cercavo il vault
   per `p.vault`, campo che le mappe più vecchie non hanno — mentre INSEGNA legge il disco, che è la
   fonte di verità. Ora la console elenca i **vault** (`getAllVaults` + `matchProjectToVault`, come
   la landing) e ci aggancia il progetto se esiste: **una mappa senza progetto in localStorage
   compare lo stesso**, coi suoi materiali (verificato con un vault «Elvezia» senza progetto).
   I file si leggono dal `fullPath` che il disco ha già dato, non ricercando la cartella per nome.
2. **Mancava il bottone per aprire la mappa**: la console elencava i materiali PRODOTTI dalla mappa
   senza un modo di aprire la mappa. Sezione «La mappa» in cima, azione **primaria** «Apri la mappa»
   + «Apri nel Finder». Segue la stessa strada delle righe di INSEGNA: `loadSavedProject` se c'è il
   progetto, `directLoadVault(fullPath)` altrimenti.
3. **Chip: la materia cade solo se la nuova classe non la insegna.** Azzerarla sempre farebbe
   ricominciare chi insegna la stessa materia in due classi; tenerla comunque svuoterebbe la colonna
   senza dire perché. Stessa regola di «Assegna classe e disciplina». Verificato: 2A·Storia → 1ªA
   (che non insegna Storia) la azzera; 1ªA·Scienze → 2A (che le insegna) la tiene; senza materia,
   tutte le mappe della classe.
- **Pezzo nuovo del motore**: `suApertura(box, ridisegna)`. Chi apre una finestra che **aspetta
  dati** (la scansione dei vault) deve poter ridisegnare quando arrivano, e `suAzione` non basta
  perché nasce da un gesto: la colonna restava su «Cerco le mappe…» per sempre.

**Round 3 (2/8) — la console prende la sua forma: elenchi per genere, tre viste vere, credenziali
che si salvano da sole.** Suite **976/0** (+5 test). Preceduta da una ricognizione a 6 lenti sul
codice esistente (workflow, 1,6M token) → piano di attacco.
- **Pezzi nuovi del motore** (tutti col loro CSS e i loro test):
  1. **`tabelle: [...]`** — PIÙ elenchi nella stessa vista, ognuno col titolo e **richiudibile**
     (il titolo È il comando: un secondo bottone accanto sarebbe un comando in più per la stessa
     cosa). Una tabella senza titolo non si può chiudere — non ci sarebbe niente su cui cliccare.
     Il contatore resta visibile a elenco chiuso.
  2. **Righe che si scelgono** (`{id, celle}`) e **celle di comandi** (`{azioni:[…]}`): in un elenco
     di materiali si apre quello che si legge, non un bottone in fondo alla riga. I comandi di riga
     non concludono, come quelli delle voci.
  3. **Sezione `nuda`**: nessun riquadro. In una console a tutto schermo una fila di comandi chiusa
     in un rettangolo grigio si legge come un ritaglio della pagina invece che come la pagina.
  4. **Sezioni collassabili** (`collassabile`/`chiusa`) e **bottoni di sola icona** già visti sopra.
  - ⚠️ **Difetto corretto strada facendo**: `attaccaTabella` agganciava `mousemove`/`mouseup` **al
    documento, una coppia per tabella e per ridisegno**, mai rimossi. Con tre elenchi e qualche
    ridisegno si accumulano in fretta: ora il trascinamento vive sul documento **una volta sola**.
  - ⚠️ Anche le righe dovevano sopravvivere alla **doppia normalizzazione** (`open` + `render`):
    l'`id` di una riga già normalizzata è una proprietà dell'array, non un campo — riconosciuta.
- **Vista della mappa**: una riga sola di comandi senza riquadro — **Mappa · Finder · Elabora ·
  Studio attivo · Lavagna** — e i materiali in **elenchi per genere** (Sintesi · Fogli dei nodi ·
  Quiz MC · Quiz V/F · Flashcard · Altri · File di lavoro, questi ultimi chiusi). `_diskKind`
  distingue ora **Quiz MC da Quiz V/F** (`^Quiz-MC-` / `^Quiz-VF-`, che è come `buildFileName` li
  scrive già). La colonna «Tipo» compare **solo dove distingue davvero**: in un elenco intitolato
  SINTESI, una colonna che ripete «Sintesi» a ogni riga è spazio tolto al nome del file.
- **Le tre viste di «Materiali»** (il gruppo si chiamava «La classe») **non clonano più l'HTML della
  landing**: sono schemi del motore, con ordinamento e colonne regolabili come il resto.
  - **Lavagna**: le due scelte del vecchio wizard (accesso allievi · rete) + **Avvia** + **Foglio
    credenziali**, e la tabella delle **sessioni da riprendere**. Nuovo `MappAICollabTeacher.avvia({
    loginMode, netMode, resumeDir })` — `doStart` resta privata: dall'esterno si passa solo ciò che
    il chiamante può davvero decidere, il resto (mappa, roster, classe) lo ricava il modulo, che è
    il solo a saperlo. ⚠️ Della sessione si mostra **solo ciò che serve a riconoscerla**: nel
    `session.json` ci sono anche i token, che in una tabella non hanno niente da fare (verificato).
  - **Attività LIVE**: avvio di *Quiz a distanza* e *Rispondi e Domanda*, più la tabella dei report
    già prodotti (la Lavagna è esclusa: ha la sua vista). Clic sulla riga = primo report, icona
    cartella = la sessione nel Finder.
  - **Stampabili**: gli stessi generi, ma sull'**unione delle mappe del contesto**, con la colonna
    **Mappa** in più — senza, due «Sintesi -VERDE.html» sono indistinguibili. Ogni vista carica i
    suoi dati **quando la si apre**, non all'apertura della console.
- **Credenziali che si salvano da sole (D)**: salvando una classe nuova, `credenziali-<classe>.pdf`
  finisce in **`Classi/<classe>/`**; i nomi appena scritti la riscrivono (senza, il foglio resterebbe
  quello del primo giorno, con «Nome: ____»). Dare un nome a un'identità **è** creare l'account di
  quell'allievo: da lì nasce la sua tessera in **`Allievi/<nome>/`** — sesta sottocartella di
  `MappAI - file`, senza cartella storica da migrare, creata alla prima scrittura (chi ha già
  migrato non l'avrebbe mai avuta). Si riscrivono **solo le tessere cambiate**: con 25 allievi,
  rigenerare 25 PDF a ogni salvataggio sarebbe un'attesa per niente.
  - IPC nuovi **`class-doc-save`** e **`class-doc-open`** (guardia sul percorso risolto, `safeName`,
    `.pdf` forzata). ⚠️ **Non** si riusa `save-pdf-to-vault`: senza `vaultPath` scrive dentro Mappe
    e **non sanitizza il nome del file**.
  - `buildCredentialCardsHtml(klass, {perPdf:true})` toglie la barra dei comandi (in un PDF non si
    clicca) e il `<link>` ai font remoti: `html-to-pdf` aspetta 150ms fissi e offline quel carattere
    non arriverebbe comunque, lasciando il foglio in un ripiego. Firma retro-compatibile.
- **Verificato nella pagina vera**: le tre viste con dati finti (avvio Lavagna nuovo e ripreso con i
  parametri giusti, report aperti, Stampabili su due mappe con 6 elenchi), **validatore a 0 errori e
  0 avvisi in tutti gli stati**, token della sessione mai a schermo, percorsi dei PDF
  (`class → 2A/credenziali-2A.pdf`, `student → Anna Rossi/credenziali-Anna Rossi.pdf`), foglio per
  PDF senza font remoti né barra. 0 errori console.
- ⚠️ **Da testare in Electron vivo**: PDF credenziali scritto davvero in `Classi/<classe>/` e la
  cartella `Allievi/` creata; avvio Lavagna dalla console (che **ferma la sessione in corso**, come
  ogni avvio); report che si aprono; anteprima di un PDF vero nella tela.
- 🐛 **Corretto (2/8, da Electron): l'area della console non scorreva.** Con «Stampabili» aperto su
  tutti i materiali, oltre l'altezza il contenuto **spariva** senza modo di raggiungerlo.
  Non era una svista: `.mm-console__area` sta a `overflow:hidden` **per disegno**, perché con UNA
  tabella lo scorrimento vive dentro `.mm-tab-wrap` (`flex:1; overflow:auto`). Con più elenchi
  quel disegno non regge — nessun riquadro è più «la» tabella. Ora, **solo quando ci sono
  `tabelle`**, l'area prende `mm-console__area--scorre`: scorre lei, e i singoli elenchi crescono
  quanto il loro contenuto (niente due barre annidate). Le **intestazioni degli elenchi sono
  sticky**: con sei generi impilati, senza, non si sa più dove si sta guardando.
  Misurato: area 820px su **5022px di contenuto**, si arriva all'ultima riga dell'ultimo elenco,
  zero scorrimento interno alle tabelle, zero sbordo orizzontale. Le console col vecchio schema
  (tabella singola, i mockup) restano `overflow:hidden` e invariate — verificato su B①.
**Round 4 (2/8) — l'allievo ha la sua cartella, e le tabelle dicono classe e materia.** Suite
**979/0** (+3 test). Dai rilievi di Giacomo in Electron.
- ⚠️ **Assunzione precedente CORRETTA**: «account allievo» **è** la scheda di `allProfiles`, non solo
  l'identità del roster. Ora la cartella nasce **col profilo**: salvando una scheda studente parte
  `student-folder-ensure` → `Allievi/<nome>/Mappe/`. E se quell'allievo appartiene a una classe, la
  sua tessera individuale si scrive lì (le due cose convivono: la scheda tara l'AI, la tessera è
  l'accesso).
- **Le mappe generate con un allievo attivo vivono nella SUA cartella**: `Allievi/<nome>/Mappe/<mappa>`.
  Non è ordine, è sostanza — una mappa fatta per un allievo con misure compensative è materiale suo,
  e mescolarla a quelle di classe ne perde la destinazione. Unica fonte del percorso:
  **`FilesCore.mapVaultRoot(basi, allievo)`** + `mapVaultParentsFor` (dentro la cartella di un
  allievo non c'è nesting classe/disciplina: i due contesti si escludono già a vicenda).
  `files-root-get` porta ora anche `studentsBaseDir`; auto-vault e pipeline usano entrambi la stessa
  funzione. ⚠️ **`get-all-vaults` scandisce anche `Allievi/*/Mappe/*`** (con `studentDir`): senza,
  quelle mappe esisterebbero su disco ma non per l'app — né in console né in INSEGNA.
- **PDF credenziali con le emoji giuste**: il `perPdf` toglieva anche il webfont, e le tessere
  uscivano in stile Apple invece che Noto/Android — ma **l'emoji È l'identità** con cui l'allievo
  entra, e sul telefono la vede in Noto. Ora il `<link>` resta anche nel PDF, `.cred-emoji` porta il
  font emoji **nello stack effettivo** (dichiararlo in una variabile non basta, §regola globale), e
  **`html-to-pdf` aspetta `document.fonts.ready`** invece di 150ms a caso (tetto 4s: senza rete si
  stampa comunque col ripiego). Il miglioramento vale per ogni PDF headless.
- **Pipeline: «Salva la fonte originale in Allegati»** — spunta nuova, con **default che segue il
  contesto**: spenta per una classe (il PDF di partenza il docente ce l'ha già, e copiarlo in ogni
  vault riempie il disco), **accesa per un allievo** (la sua cartella è ciò che gli si consegna e
  deve bastare a sé stessa). Scrive dopo il vault, prima dei materiali, e se fallisce non ferma la
  pipeline. Nuova `MappAIElabora.copySourcesTo(vaultPath, cartella)`: diversa da
  `flushSourcesToVault`, **non tocca `src.vaultRel`** — quella è la copia che ELABORA usa per
  l'anteprima, e due originali che si contendono lo stesso ruolo sono un guaio.
  `sanitizeVaultRelPath` ammette ora `Allegati/` (oltre a root, `Materiale Studio/`, `Fonti/`).
- **Classe e materia in OGNI tabella** della console (materiali, stampabili, sessioni Lavagna,
  report LIVE): sono le due coordinate con cui il docente ritrova le cose. Dove il dato non c'è
  nella riga si ricava dalla mappa (`discOfMap`) — è la stessa coppia, letta da due posti diversi a
  seconda di chi l'ha scritta. Verificato: 0 sbordi, validatore a 0 errori/0 avvisi.
- ⚠️ **Da testare in Electron vivo**: generazione con allievo attivo → mappa dentro la sua cartella
  e visibile nella console; spunta della fonte accesa da sola col profilo allievo; emoji Noto nel
  PDF delle credenziali. (Cartella `Allievi/<nome>/` alla creazione della scheda: **verificata da
  Giacomo**, funziona.)

### ✅ FATTO (2/8/26): console «CABINA» — la seconda console in app
`public/js/mappai-cabina.js` (`window.openCabina(voce)`), caricata dopo teacher-profile.
I **quattro bottoni solo-icona dell'header** (Config AI · Guida · Tutorial · Profilo) portano ora
alla Cabina, ognuno sulla sua vista, e hanno finalmente un **nome accessibile** (`aria-label` +
`title`) — erano quattro comandi muti, finding di gravità alta dell'audit del 31/7. Il ripiego apre
la superficie di prima, così spegnere il motore non lascia l'header inerte.
- **Migrato davvero**: «Profilo insegnante» monta le STESSE sezioni di `showTeacherProfileModal`
  (`MappAITeacherProfile.sezioni`) — una fonte sola, altrimenti due superfici che dicono la stessa
  cosa divergono al primo ritocco. Dal modulo profilo escono `assorbi`, `salva` e `comandoElenco`.
  «Classe attiva» è un elenco vero: **un clic attiva**, come le schede studente.
- **Dichiarato come ponte**, non nascosto: «Impostazioni AI», «Consumi», «Guida/Tutorial» per ora
  APRONO la finestra che esiste già. Una console che finge di aver assorbito tutto nasconde il
  debito; questa dice cosa manca ed è il posto da cui si vedrà.
- ⚠️ **Difetto trovato misurando**: «Salva profilo» **chiudeva la console e non salvava**. Un'azione
  di piè conclude per default, quindi non arrivava mai al gestore che scrive. `chiude:false` —
  salvare non è uscire: la Cabina è la casa del profilo, si salva e si continua. Dopo il salvataggio
  lo schermo si rilegge dallo store: ciò che resta a video è ciò che è finito su disco.
- Misurato: console piena 1434×900, validatore **0 errori / 0 avvisi**, profilo scritto → cambio
  vista → tornato indietro **conserva quello che si stava scrivendo**, materia aggiunta e salvata
  (`disciplineList()` allineato), classe attiva che cambia anche il chip, 0 errori console.
- ⚠️ **Da testare in Electron vivo**: i quattro bottoni dell'header, il salvataggio del profilo che
  si riflette su form classi e generazione, il passaggio ai quattro ponti.

**Round 5 (2/8) — due difetti veri nelle schede studente.** Suite **979/0**.
1. **Attivare una scheda costava quattro clic** (Gestisci → Attiva per taratura → Salva → chiudi).
   Ora **la riga È il comando**: un clic attiva, con `role="button"` e Invio/Spazio da tastiera.
   «Gestisci» ferma la propagazione — sta dentro la riga, e senza quello aprire la gestione
   cambierebbe anche il contesto attivo: due effetti per un clic solo.
2. **L'eliminazione non cancellava niente e mostrava il codice della funzione.** Non era lo z-index:
   `showConfirm(title, message, onConfirm)` vuole **tre** argomenti e gliene arrivavano **due** →
   la callback finiva stampata come messaggio e `onConfirm` restava `undefined`. Unico punto nel
   repo con quella firma sbagliata (censiti tutti i chiamanti). Passato al motore
   (`MappAIModal.conferma`, distruttivo).
   - ⚠️ **E però lo z-index era un secondo difetto, vero**: i modali scritti a mano stanno a **9992**
     (account classi, profilo insegnante) e il motore partiva da **2000** → qualunque conferma
     aperta sopra uno di loro sarebbe finita DIETRO. `Z_BASE` (e `.mm-overlay`) portati a **12000**:
     sopra i legacy censiti (max 10005), ben sotto i fumetti (2147483000), che devono stare sopra
     tutto per definizione. Numero **censito col grep degli z-index del repo**, non scelto a occhio.
     Verificato con `elementFromPoint`: la conferma è davvero l'elemento in cima.
- Due dettagli dallo screenshot di Giacomo: `Foglio-nodi-card` non era riconosciuto (la regex
  pretendeva il trattino: ora `^Foglio.?nodi`), e i **`.json` dei set** comparivano come «File»
  generici in mezzo ai materiali — ora si chiamano «Dati» e **scendono in fondo**: chi apre quella
  vista cerca un documento da usare in classe, non lo stato interno dell'app.

- **Prossimo**: i **quattro cloni rimasti** della barra documenti (branch-synthesis · causal-chains ·
  timeline · glossary · live-reports) e il contenitore mancante di «File condivisi».

### ✅ FATTO (2/8/26): Cabina round 6 — otto viste, tre ponti chiusi su cinque
Suite **981/0** (+3 test). Le cinque richieste di Giacomo, tutte misurate nella pagina vera a
1440×900 (server statico, `#beta-lock-screen` tolto lato-DOM). Validatore: **0 errori e 0 avvisi su
tutte e otto le viste**; 0 errori console.
1. **La console si apre dal profilo docente** — `btn-user-profile` → `openCabina('profilo')`, già
   così: verificato, riquadro **1434×900**, chip del contesto in testata.
2. **«Classe attiva» → «Allievi & Classi»**, con i profili a schermo. Due `tabelle` (quindi due
   `.mm-tab-wrap`): **Profili classe** (classe · grado · registro · materie · allievi · Gestisci) e
   **Profili allievo** (allievo · classe · grado · età · note per la taratura · Gestisci). La riga È
   il comando: un clic attiva quel contesto (verificato: 1B → `mappai_active_class=c2`; Anna Rossi →
   azzera la classe, come l'esclusione mutua vuole). Bollino: **indigo** = contesto attivo · verde =
   taratura speciale · grigio = standard, ognuno col suo `title`.
3. **«Guida e tutorial» → due voci.** «Consigli di studio» monta i metodi di studio dalle STESSE
   chiavi del modale storico (`study_*`) — fonte una sola — con l'emoji tolta dai titoli (nella
   console il titolo è testo, le icone le disegna Lucide) e un comando che riapre la finestra con la
   lettura ad alta voce. **«Tutorial»** è scritto qui: la progressione in 4 passi chiesta da Giacomo
   (scheda corta a L2 → la mappa la costruisce l'allievo → due fonti a L3 → capitolo intero con
   «Genera materiali»), più la sezione sulle due leve (contesto attivo · «Genera fino a» ≠ «Mostra
   fino a»). Header: `btn-app-guide` → Tutorial, `btn-app-tutorial` → Consigli (con gli `aria-label`
   allineati).
4. **«Consumi AI» migrato**, non più un ponte: filtri in testa (**classe o allievo** · **materia** ·
   tasso) → elenco **«Mappe» richiudibile** in `.mm-tab-wrap` (mappa · classe/allievo · materia ·
   chiamate · costo) → il cruscotto vero nella tela. Il cruscotto NON è ridisegnato: arriva da
   `MappAIUsageDash.contentHtml`, esportato apposta — due copie degli stessi numeri divergono al
   primo ritocco. Misurato: classe 1B → 4 chiamate su 12, materia «Scienze naturali» → 1 mappa,
   allievo senza mappe → stato vuoto, riga selezionata → 4 chiamate col bollino, secondo clic →
   torna a tutte; drill-down sulla ciambella e ritorno; tasso 0.9→1.8 raddoppia il totale; Stampa
   produce il report della selezione.
   - **Il registro non sa di classi e materie** (un record porta solo il progetto): le tre coordinate
     arrivano da **`MappAITeach.contestoDelleMappe(vaults)`**, che le legge dal DISCO
     (`classDir`/`discDir`/`studentDir` + `matchProjectToVault`) e ripiega sui campi del progetto
     dove Electron non c'è. Sta in landing-teach perché lì vive già la regola «la cartella è la
     fonte di verità».
5. **«Termini & Condizioni» e «Privacy»**: testo che dice quello che il codice fa davvero (che cosa
   esce dal computer, che cosa entra nel prompt, dove finiscono i file, chi paga le chiamate).
   ⚠️ È una **sintesi informativa, non un testo legale**: la versione definitiva la scrive Giacomo.
- **Pezzi nuovi / corretti del motore e dei token**:
  - `tabelle` + `tela` **non sono più un errore**: si contendevano lo spazio solo la tabella
    PRINCIPALE (`flex:1`) e la tela. Con gli elenchi titolati l'area scorre e loro crescono col
    contenuto → è esattamente la forma dei Consumi. CSS nuovo: dentro `--scorre` la tela diventa un
    blocco nel flusso (`flex:0 0 auto; display:block`), altrimenti il cruscotto restava centrato in
    mezzo a un riquadro alto quanto lo spazio avanzato. Bollino nuovo `--attivo` (colore d'azione:
    segna una scelta in corso, non uno stato del dato).
  - ⚠️ **Difetto vero trovato al primo clic**: una **riga di tabella CONCLUDE per default**, come
    una voce di elenco — scegliere una mappa o una classe **chiudeva la console**. Nella Cabina le
    righe passano tutte da un helper che rovescia il default una volta sola (`_riga`), e c'è il test
    che prova la sopravvivenza alla doppia normalizzazione.
- ⚠️ **Z-index: i tre ponti erano inusabili** e nessuno se ne era accorto. Account classi sta a
  9992, config AI a 9999, il cruscotto storico dei consumi a **1200**; la console parte da 12000 →
  aperti DA QUI finivano **dietro**. Ora l'overlay degli account si alza da sé sopra la pila del
  motore (`_zSopraMotore` in live-classes) e la Cabina alza gli altri (`_alza`). Con essi arriva
  l'**ESC a strati**: il primo ESC chiude la finestra storica in cima, il secondo la console —
  verificato (`elementFromPoint` dice che la finestra classi è davvero l'elemento in cima).
- ⚠️ **Copia corretta perché era falsa**: «i profili degli allievi non entrano mai nelle chiamate
  all'AI» (`tp_allievi_testo`). Le **note** ci entrano eccome, quando la taratura è attiva
  (`MappAITune.activeTuningBlock`); il nome, quello no. Su una frase che parla di dati sensibili la
  precisione non è stile.
- Altri due dettagli misurati: «Gestisci» non usa il ruolo `quieto` (in una cella di comandi diventa
  **rosso al passaggio** — è la veste del cestino) · il campo del tasso porta un `aiuto` visibile,
  perché coi campi a solo segnaposto un valore già scritto resta un **numero nudo** («0.9» fra due
  tendine non dice niente).
- ⚠️ **Da testare in Electron vivo**: i quattro bottoni dell'header; «Gestisci» che apre davvero la
  scheda giusta e ci si salva sopra; Consumi col registro VERO su disco (là `getAllVaults` esiste →
  si esercita il ramo disco di `contestoDelleMappe`, e con esso il filtro per **allievo**, che nel
  browser non ha dati); «Apri la cartella dei consumi»; report di stampa scritto davvero; switch
  lingua EN sulle otto viste.

**Round 7 (2/8) — i sei rilievi di Giacomo in Electron.** Suite **981/0**. Cinque su sei avevano la
STESSA radice: chi apre una finestra sopra la console si calcolava il piano da sé.
- 🐛 **Z-index: il piano ora si CHIEDE, non si calcola.** `MappAIModal.prossimoZ()` (contatore che
  sale a ogni finestra aperta e torna a 12000 a schermo sgombro) → l'ordine a video è l'ordine di
  apertura, che è l'unico che l'utente riconosce. Contare la pila non bastava più: le finestre non
  migrate si alzano sopra la console e nella pila NON stanno, quindi la conferma aperta dopo di loro
  prendeva un numero più basso e finiva sotto. Tre difetti chiusi con questo:
  **(2)** la conferma di eliminazione di un profilo allievo ora sta sopra la scheda (misurato:
  12400 su 12220, ed è l'elemento in cima); **(3)** «Elimina classe» passava da `showPrompt`, che è
  markup fermo a **z-9999** → la finestra c'era ma sotto, e il bottone sembrava morto: ora è
  `MappAIModal.chiedi` (parola sbagliata → zero cancellazioni, verificato); e **un difetto mio**
  trovato allo screenshot: `_alza` calcolava ancora `12000 + aperti*100 + 20`, numero che poteva
  risultare **più basso** di quello già preso dalla console (13020 contro 13300) — la scheda di
  creazione finiva dietro. Ora chiede anche lui il prossimo piano.
- 🐛 **(2-bis) La tabella non si aggiornava da sola**: si eliminava un profilo e la riga restava
  fino a un cmd+R. La finestra di gestione non sa che una console la sta guardando → ora ogni
  scrittura (`STORE.save`, `_saveProfiles`) annuncia **`mappai-profili-cambiati`**, e la Cabina
  ridisegna se è su una vista di profili. Verificato: eliminato «Marco Verdi» → riga via senza
  ricaricare.
- **(4) «Allievi & Classi» scorporato in «Allievi» e «Classi»** — due elenchi con colonne diverse e
  due gesti diversi («crea una classe» ≠ «crea una scheda»); insieme obbligavano a scorrere una
  tabella per arrivare all'altra. In ciascuna: **tabella in alto**, e sotto **«Generico»** +
  **«Crea profilo»** — i comandi vivono nel piè, che dentro la console sta DENTRO l'area, quindi
  cadono sotto l'elenco. Il contesto attivo passa nella nota, fra tabella e comandi.
- **(5) Preset di taratura nella scheda allievo**: la tendina usa **`REGISTERS`**, la stessa
  costante delle classi (semplice BES/DSA · standard · ricco) — un vocabolario parallelo per la
  stessa scelta divergerebbe al primo ritocco. Il preset entra davvero nel prompt via
  `MappAITune.activeTuningBlock` (`MappAIClasses.registerPrompt`), compare come colonna «Preset»
  nella tabella e conta per il bollino «taratura speciale» con la stessa regola delle classi
  (**medio = standard**, non speciale).
  - ⚠️ **Difetto trovato misurando**: la riga «Usa frasi brevi, lessico concreto» era
    **incondizionata** — col preset «Ricco» (periodi complessi, terminologia disciplinare) il
    prompt avrebbe chiesto due cose opposte nella stessa frase. Ora quando c'è un preset comanda
    lui; senza, resta il default prudente di prima. La riga di fedeltà ai fatti vale sempre.
- **(6) Modali di creazione a taglia L (820) su due colonne**: allievo = identità | taratura,
  classe = chi è la classe | dove e cosa insegna. In colonna unica la taratura finiva sotto la
  piega e si compilava senza vedere la scheda a cui si riferisce. `minmax(0,1fr)` per colonne
  davvero uguali (senza, le pillole delle materie sbilanciavano 408/352), la seconda colonna sparisce
  se il profilo non dichiara sedi né materie, e sotto i 760px si torna a una colonna sola.
  Stessa taglia anche in MODIFICA: è la stessa scheda, due vesti sarebbero due cose da tenere allineate.
- ⚠️ **Da testare in Electron vivo**: eliminazione di una classe con allievi veri (cartelle su
  disco), creazione classe con sedi e materie dal profilo, preset allievo su una generazione VERA.

### ✅ FATTO (3/8/26): VISTA RIDOTTA di COSTRUISCI (combo SHIFT+CTRL+L,K,J,H)
`public/js/mappai-vista-ridotta.js` + un blocco in `mappai-modal-tokens.css`. Resta a schermo solo
la strada breve: **PDF a tutta colonna → MM (default) o KG → tema (MM) o numero di nodi (KG) →
Genera materiali / Genera mappa → Mappa manuale**. Si ricorda (`mappai_vista_ridotta`).
- **Nascosti**: le altre quattro fonti · macro-aree a mano e «genera L1 in automatico» · focus,
  lenti e picker disciplina · intestazioni degli step 3 e 4 · impostazioni di generazione · stima
  token/costo · «Apri Vault» e «Apri JSON» · «Analisi (docente)» (solo qui: nella vista completa
  resta). «Consumi AI» invece è **eliminato dalla landing** in ogni modalità — vive nella Cabina.
- **Default messi dalla vista** (le leve non sono a schermo, quindi le mette lei, chiamando gli
  stessi setter dei bottoni nascosti): multipass ON · logica **adattiva** (`setMMLogic('triage')`) ·
  profondità automatica ON.
- **«Adatta al livello» si arma da solo** quando il contesto attivo dichiara il preset **semplice
  (BES/DSA)** — allievo o classe, anche senza note scritte a mano: il preset da solo dice già che il
  testo va calibrato. Con «medio» o «ricco» non si tocca. Verificato nei tre casi.
- ⚠️ **La combo non era libera.** Attivava `toggleStudentMode`, che nascondeva `#setup-form`
  INTERO e sostituiva due prompt (`KNOWLEDGE_GRAPH_SINGLE_STUDENT`, `SOTA_SECOND_BRAIN_STUDENT`)
  più una riga «titoli max 3 parole» in 5 punti di mm/kg-extraction. Le due cose si contendono lo
  stesso elemento — una lo nasconde, l'altra lo mostra ridotto — quindi non potevano convivere.
  **Decisione di Giacomo: la vista ridotta prende la combo, la modalità studente va in pensione.**
  `window.toggleStudentMode` resta esposta (console) e i rami `appState.studentMode` restano
  innocui: il flag non si accende più da nessuna parte.
- ⚠️ **Trappola misurata**: il riquadro vuoto dello step 4 (in MindMap) non si spegneva né con
  `:has()` né con una classe dedicata, entrambe con `!important` e specificità maggiore — in un
  foglio con 700+ `!important` la cascata non è prevedibile a tavolino. Lo spegne uno **stile inline
  con priorità**, messo e tolto da `sincronizzaGenere()`. Senza, restavano 96px di aria fra il tema
  e i bottoni.
- Misurato a 1440×900: PDF **1240px** a tutta colonna, ordine verticale corretto (PDF → MM/KG →
  tema → genera → mappa manuale), MM mostra il tema e nasconde lo slider, KG il contrario, e
  spegnendo la vista **tutto torna** (url, testo, macro-aree, focus, step 4, stima, Apri Vault,
  Analisi). 0 errori console.
- ⚠️ **Da testare in Electron vivo**: la COMBO vera (nel pannello browser `app.js` arriva dalla
  cache, quindi il dirottamento è verificato leggendo il file servito, non premendo i tasti) e una
  generazione reale dalla vista ridotta.

**Round 2 (3/8) — passi che si sbloccano, e la taratura della pipeline semplifica sul serio.**
Suite **981/0**, 0 errori console.
1. **Taratura AI della pipeline = SEMPLICE (BES/DSA), sempre.** Chi accende «Adatta alla classe» nel
   modale «Genera materiali» chiede una mappa leggibile: un preset «standard» o «ricco» del profilo
   andrebbe nella direzione opposta. Nuovo flag `MappAITune.levelForceSimple`, acceso solo da
   `armLevel(true)` — la pipeline lo usa, il toggle della landing chiama `armLevel()` e non cambia
   niente. Con la forza attiva il registro semplice **vince sul preset** e vale anche su un contesto
   GENERICO, dove prima la riga usciva vuota e la spunta non faceva nulla.
   Misurato su una classe con preset «ricco»: landing → «lessico adeguato all'età»; pipeline →
   «frasi brevi, lessico concreto, un concetto per frase… adatto a studenti BES/DSA».
   - 🐛 **Difetto vero trovato qui**: la pipeline faceva `lt.checked = config.levelTuned` e basta —
     ma impostare `.checked` da JS **non scatena `onchange`**, quindi `MappAITune.levelArmed`
     restava falso e la taratura **non finiva mai nel prompt**. Ora si arma il motore e la spunta lo
     segue. Aggiunto anche il ripristino in `finally`: la taratura vale per QUELLA mappa, non per il
     resto della sessione.
2. **Vista ridotta: via i titoli numerati, l'ordine lo dice l'opacità.** Tre passi — carica il PDF ·
   scegli MM o KG (col tema o lo slider) · genera — e quello che non si può ancora fare sta al 15%
   con `pointer-events:none`. Lo stato si **ricalcola dai dati** a ogni cambiamento invece di
   accumularsi: togliendo la fonte o cancellando il tema si torna indietro da soli. Verificati tutti
   e sette gli stati, avanti e indietro; «Mappa manuale» resta sempre viva (è un'alternativa, non un
   passo). Agganci: MutationObserver su `#sources-container` (le fonti si aggiungono costruendo
   HTML, non c'è una funzione di render da cui passare) + `change` sul contenitore + `input` sul
   tema + la patch di `setMode`.
   - ⚠️ Una riga di fonte appena aggiunta **non conta**: si contano solo le fonti che portano
     davvero un file o del testo, altrimenti il passo avanzerebbe premendo «Documenti» senza aver
     scelto niente.
   - ⚠️ **Trappola di misura**: a pannello nascosto le animazioni CSS sono sospese e `.glass-card`
     resta a opacità 0 — le opacità lette erano inaffidabili (davano 0.15 anche su elementi senza la
     classe). La verifica è stata fatta sulla CLASSE `vr-bloccato`, che è la logica; il legame
     classe→opacità è provato a parte (con classe 0.15, senza 1).

### ✅ FATTO (3/8/26): «Progetti salvati» esce da COSTRUISCI
La sezione collassabile è **eliminata**: COSTRUISCI torna a essere solo il modulo di generazione.
Le mappe già fatte si aprono da ELABORA («Progetti esistenti») e da INSEGNA, che le leggono dal
**disco** — la fonte di verità; questa lista veniva invece da localStorage ed era un elenco
parallelo dentro la schermata in cui si crea una mappa nuova.
- Tolti: il markup (`build-projects-section` e i suoi cinque figli, compreso il filtro
  CLASSE/TUTTI di COSTRUISCI), la chiave i18n `ui_build_projects` da entrambi i dizionari, e i due
  call site di `renderBuildProjects` (in `applyMode` e in `setClassFilter`, dove ora si esce subito:
  senza quel `return` il filtro avrebbe ridisegnato INSEGNA stando in COSTRUISCI).
- `toggleBuildProjects`/`renderBuildProjects` restano come **no-op**: sono esposte su
  `MappAITeach` e non si sa chi le chiami da fuori.
- ⚠️ **Debito dichiarato**: `StorageManager.renderRecentProjects` (le card con menu grade) e
  `MappAITeach.editGrade` non hanno più un ingresso nella UI. Non le ho tolte perché
  `renderRecentProjects` è chiamata anche da `deleteProject` e dall'init di storage-lang, e la
  guardia `if (!container) return` le fa degradare in silenzio — verificato che nessuna delle due
  lanci. Se il grado non serve più, è una pulizia a sé.
- Misurato: **0** dei 7 id della sezione rimasti nel DOM, figli visibili della card = hero · barra
  tab · build-content · avvii rapidi · link finali (nessun contenitore vuoto residuo), ELABORA
  continua a elencare le 6 mappe, il suo filtro classe funziona, e da COSTRUISCI il filtro non
  cambia più modalità. 0 errori console.

### ✅ FATTO (3/8/26): la tabella dei progetti passa a `.mm-tab-wrap`
La tabella di ELABORA («Progetti esistenti») si disegnava il suo contenitore
(`overflow-y-auto max-h-[340px]`): bordo, raggio e scorrimento erano un'altra cosa rispetto agli
elenchi delle console. Ora `fileTable` emette **`.mm-tab-wrap`**, cioè il contenitore-tabella del
motore — una veste sola per la stessa cosa. Il tetto di altezza (340px) resta dichiarato lì: nel
motore lo dà il layout della console, che sulla landing non c'è.
- Cambia in un posto solo e vale ovunque: `fileTable` la usano ELABORA, INSEGNA (kill-switch
  console), Materiali, Quiz cartacei e File condivisi — **tutte le chiamate passano già
  `scroll:true`**, quindi nessuna resta indietro con la veste vecchia.
- Misurato: wrap `1214×340`, bordo `1px #e2e8f0`, raggio 12, `overflow:auto`, intestazione
  ancora **sticky**, 12 righe che scorrono, nessuno sbordo orizzontale; **0** contenitori vecchi
  rimasti; **0** wrap annidati dentro la console INSEGNA (là le viste usano `tabelle` del motore, che
  il suo `.mm-tab-wrap` ce l'ha già). «Progetti salvati» di COSTRUISCI non è toccata: non è una
  tabella, sono card (`renderRecentProjects`).

### ✅ FATTO (2/8/26): la landing si apre VUOTA
All'avvio restano il marchio, il selettore Costruisci/Elabora/Insegna, il chip del contesto, la
Cabina e il nastro viola di insegnai.ch. Nient'altro: **nessun tab aperto**, niente avvii rapidi,
niente link in fondo. La schermata d'ingresso è una domanda («che cosa vieni a fare?»), non la
ripresa di ieri — mentre il CONTESTO di lavoro, quello sì, si ricorda e vive nel chip.
- `readMode()` ammette ora `''` come stato vero. Prima qualunque valore non riconosciuto ripiegava
  su `'build'`, quindi lo stato vuoto **non poteva esistere**; `applyMode()` con `''` nasconde i tre
  contenuti, non accende nessun segmento e spegne anche `landing-quick-actions` e
  `landing-meta-links` (appartengono a COSTRUISCI, non all'ingresso). `init()` scrive `''`.
- **Unica eccezione**: il segnalibro della console (uscita verso una mappa → HOME) continua a
  vincere sul vuoto, altrimenti tornare indietro porterebbe a una schermata muta. Verificato: col
  segnalibro la console si riapre, senza si torna vuoti.
- Misurato: `build`/`teach`/`elabora` tutti nascosti, 0 segmenti attivi, chip e Cabina presenti; e i
  tre tab funzionano ancora (Costruisci mostra anche gli avvii rapidi, ELABORA li nasconde, Insegna
  apre la console).
- **Bottone Cabina teal-400 → teal-600 al passaggio, icona BIANCA** (scelta di Giacomo).
  ⚠️ Misurato: bianco su teal-400 fa **1,86:1**, sotto i 3:1 che WCAG chiede a un'icona che porta
  informazione; sull'hover risale a **3,74:1**. Il glifo resta riconoscibile per forma e il bersaglio
  è grande. La leva per rientrare nella soglia è una riga: `color: #0f172a` porta il riposo a 9,59:1.
  La regola sta nel foglio dei token (fuori dai layer), altrimenti l'`hover:bg-emerald-400` di
  `.btn_header_setting` vincerebbe: verificato che l'emerald non ricompare.
- 🐛 **Il selettore si spostava di 3px** passando dalla landing vuota a un tab. Non era il selettore:
  era la **barra di scorrimento**, che compare col contenuto e si porta via 6px di larghezza —
  tutto ciò che è centrato scivola di metà (misurato: `clientWidth` 1440 → 1434, selettore da 100 a
  97). Corretto con `scrollbar-gutter: stable` su `html`: lo spazio è sempre riservato. Scarto **0**.
- **Via la riga sotto l'hero** (`border-b border-indigo-200/60`): su una schermata quasi vuota una
  linea a tutta larghezza era l'elemento più marcato della pagina. Misurato: 0 bordi orizzontali
  larghi nella landing.
- 🐛 Trovato correggendo: **`setMode('')` scriveva comunque `'build'`** e accendeva COSTRUISCI —
  la funzione non sapeva dire lo stato in cui l'app si apre. Ora `''` è un valore che accetta.

### ✅ FATTO (2/8/26): header della landing — chip del contesto + Cabina
Da cinque comandi a **due**. Suite **981/0**, 0 errori console.
- **Il chip classe · materia** prende il posto del bottone rettangolare «classe attiva»: è lo STESSO
  `MappAIModal.chipContesto` che le console hanno in testata — la stessa informazione non può avere
  due vesti. Due metà, ognuna col suo selettore: **contesto** (Generico · classi · schede allievo,
  con «Gestisci classi e allievi» nel piè) e **materia** (le materie della classe attiva, o quelle
  del profilo). La prima metà porta l'ALLIEVO quando è lui il contesto — classe e allievo si
  escludono, quindi una sola è piena per volta. Ripiego al bottone di prima se il motore è spento.
- **Un solo bottone «Cabina»** (`sliders-horizontal`) al posto dei quattro solo-icona: erano quattro
  porte per quattro viste della stessa finestra. È un **cerchio del diametro del chip** che gli sta
  accanto — e il diametro NON è un numero scritto a mano: è il token **`--mm-ctx-h` (43px)**, che
  detta anche il `min-height` del chip. Una leva sola per entrambi; con due numeri, il primo ritocco
  al chip lascerebbe indietro il cerchio.
  ⚠️ La regola sta in `mappai-modal-tokens.css` e non nel `@layer components` di index.html:
  `.btn_header_setting` è dichiarata in quel layer con `h-20`, e **le regole in layer perdono contro
  quelle fuori** — scritta lì accanto, l'altezza del cerchio avrebbe perso.
  Misurato: chip 43px · Cabina **43×43**, `border-radius: 50%`, centri allineati; resta tonda con un
  nome di classe lungo (chip 197px), a 375px di viewport e perfino con l'header ristretto a 200px
  (`flex: 0 0 auto`); il chip in testata alle console non cambia (244×43).
- 🐛 **Doppione trovato togliendoli**: `mappai-storage-lang.js` riagganciava `showConfigAIModal` /
  `showAppGuide` / `showAppTutorial` su quei bottoni **in aggiunta** all'`onclick` inline che apriva
  la Cabina — un clic apriva due cose, la Cabina e la finestra storica sotto. Via coi bottoni.
  Tolte anche due righe morte di i18n (`btn-app-guide-label`, `btn-app-tutorial-label`: elementi che
  nel markup non esistevano).
- Misurato: header = chip + Cabina, chip alto **43px**, le due metà cambiano davvero il contesto
  (allievo → azzera la classe; classe → azzera l'allievo; Generico → entrambi vuoti) e la materia
  scelta finisce in `mappai_active_discipline`.
- **Niente selettore della classe all'avvio** (2/8): `maybePromptLaunch` è stato tolto. Era una
  domanda a cui l'app sapeva già rispondere — classe, allievo e materia attivi vivono in
  localStorage e sopravvivono alla chiusura. Si riparte dall'ultima scelta e la si legge nel chip,
  che è anche il posto da cui si cambia. (Il flag di sessione `mappai_class_prompted` non serve
  più.) Verificato dopo 2s dal boot: nessun modale, chip su **1B · Storia** (l'ultima scelta) e
  `tuningForPrompt` che riparte da quella classe senza chiedere niente.
- **Il chip NON compare in testata alla Cabina**: lì era un doppione in sola lettura, per giunta
  accanto alle viste «Allievi» e «Classi», che il contesto lo mostrano riga per riga col bollino e
  lo cambiano con un clic. Resta invece nella console **INSEGNA**, dove non è un'etichetta ma il
  FILTRO della colonna delle mappe. Misurato: 0 `.mm-ctx` in tutte le viste della Cabina, testata
  62px, validatore 0/0 su tutte e nove; cambiando classe dal chip dell'header la Cabina la
  rispecchia (nota + bollino sulla riga giusta).
- ⚠️ **Da testare in Electron vivo**: che il chip compaia anche nella barra della mappa (là l'header
  è un altro) e che «Gestisci classi e allievi» dal chip si apra sopra, non sotto.

**Round 8 (2/8) — titoli, taratura alla nascita, geometria dei bottoni.** Suite **981/0**,
validatore 0/0 su tutte e otto le viste.
1. **I titoli li dichiara la schermata, non il contenitore.** `overlay(body, larghezza, titolo)`:
   «Nuovo profilo allievo» · «Nuovo profilo classe» · «Profilo allievo · <nome>» · «Profilo classe ·
   <nome>». Prima l'intestazione diceva sempre «Account classi e studenti» (dove sei, non che cosa
   stai facendo) e il titolo vero era ripetuto DENTRO il corpo, in un carattere più piccolo di
   quello dell'intestazione. Tolto il doppione da entrambe le schede.
2. **La taratura AI entra nella CREAZIONE della classe**, larga quanto il modale e sotto le due
   colonne (misurato: 772px, pari alla griglia). Non è un dato dell'identità — è come l'AI parlerà
   a quella classe — e le note sono un campo di testo, che in mezza colonna si scrive male.
   `classTuningCard(c)` + `wireTuningHelp(ov)` estratte da «Gestisci»: una scrittura, due schermate.
   ⚠️ Difetto vero che chiude: prima si creava la classe e bisognava **riaprirla** per tararla, e
   chi non lo faceva generava materiali senza taratura senza saperlo. `register` e `notes` ora si
   scrivono alla nascita (verificato: 3C creata con `ricco` + note).
3. **`.mm-btn` prende la geometria del «bottone (senza classi)» di «Account classi e studenti»**
   (helper `btn()`, il metro contro cui l'officina aveva giudicato le altre famiglie): raggio 10,
   padding 9×14, corpo **12px**, peso 700 — primario indigo senza bordo, secondario bianco con
   bordo `#e2e8f0`, distruttivo bianco con testo rosso e bordo `#fee2e2`. Misurato contro il
   riferimento: **identici**, e un `.mm-btn` senza icona fa **38px** come lui.
   - ⚠️ **Ribalta la decisione del 31/7** (14px + padding 13 = bersaglio ~47px, «bersaglio
     comodo»): il bersaglio scende a **38px** — sopra i 24 di WCAG 2.2, sotto i 44 consigliati per
     il tocco su iPad. Scelta di Giacomo; la leva per tornare indietro sono i due token
     `--mm-btn-fs` / `--mm-btn-pad-y`.
   - Due effetti collaterali trovati misurando, corretti: il **chip di contesto** seguiva
     `--mm-btn-pad-y` e sarebbe sceso da 43 a ~35px (ora ha il suo valore: è un comando primario
     presente su ogni tab); il bottone **solo-icona** restava **44×22** perché `padding:0` gli toglie
     il ritmo verticale — accanto a un bottone con etichetta alto 40 si leggeva come rotto (ora
     `min-height:40`, e le celle di comando delle tabelle restano 34×34).
   - ⚠️ Niente `line-height` dichiarato su `.mm-btn`: imporne uno faceva misurare 34px dove il
     riferimento ne fa 38.

🐛 **CORRETTO (2/8): in INSEGNA «Mappa» non apriva la mappa** (segnalato da Giacomo: si chiudeva la
console e compariva l'interfaccia di ELABORA). Suite **981/0**.
- **Causa**: `apri` · `elabora` · `live` · `collab` sono azioni CONCLUSIVE (portano fuori dalla
  console) e la loro logica stava in `suAzione` — dove non arriva mai. Il motore, per un'azione che
  conclude, fa `chiudi(risultato)` e consegna l'esito al **`.then()` di `open()`**: `suAzione` non
  viene chiamato. Erano quattro bottoni che chiudevano la finestra e basta — verificato spiando
  `loadSavedProject`: **zero chiamate**.
- **Perché sembrava «si apre ELABORA»**: entrando in INSEGNA la console NON scrive
  `mappai_landing_mode` (per scelta: `setMode` esce prima, così sotto resta dov'eri). Chiudendosi
  senza fare niente riappariva quindi la landing com'era — ELABORA, se si veniva da lì.
- **Fix**: le quattro azioni vivono nel `.then()`, che è dove il motore le consegna. La mappa scelta
  si legge PRIMA di azzerare `_cons`, altrimenti dopo il reset non si saprebbe più di quale mappa
  si parlava. `_consAvvia(m, kind)` riceve la mappa invece di ricavarsela (a quel punto la console
  è già chiusa); `_consApriMappa` sparisce.
- 🐛 **Seguito (2/8): con HOME dalla mappa si tornava in ELABORA, non alla console.** Due cause,
  entrambe corrette.
  1. **La landing sotto la console ora va su COSTRUISCI.** `setMode('teach')` usciva *senza scrivere*
     `mappai_landing_mode`, quindi «sotto resta com'era»: chi entrava in INSEGNA da ELABORA, chiuse
     la console, si ritrovava in ELABORA. La console è a tutto schermo — quello che sta sotto non è
     una scelta dell'utente, è solo dove si atterra. (Il commento nel codice lo dichiarava già:
     mancava la riga che lo faceva.)
  2. **Segnalibro della console.** `backToLanding` fa `location.reload()`: niente sopravvive tranne
     lo storage. Uscendo verso una mappa (Mappa · Studio attivo · Lavagna) si annota la voce in
     `sessionStorage 'mappai_teach_console_back'`; `init()` lo consuma **una volta sola** e riapre
     la console su quella mappa. `openConsoleInsegna(voceIniziale)` la applica DOPO la scansione del
     disco — prima che le mappe siano arrivate quell'id non esiste ancora.
     «Elabora» NON lascia il segnalibro: porta a un'altra superficie della landing, e tornarci è
     esattamente quello che si è chiesto.
  - Verificato: entrando da ELABORA la modalità sotto diventa `build`, il segnalibro vale `p:p1`,
     dopo il reload la console si riapre **sulla mappa giusta** (voce attiva + sottotitolo + i 5
     comandi) e il segnalibro è consumato; un segnalibro **morto** (mappa eliminata nel frattempo)
     apre la console senza selezione invece di rompersi; la × non lascia segnalibro (niente anello);
     «Elabora» riporta la landing su `elabora`.
- 🐛 **Seguito (2/8): «Elabora» apriva la mappa invece di ELABORA.** Riprodotto misurando: il
  difetto è **solo sui Knowledge Graph**. `MappAIElabora.hasMap()` chiede `extractionMode ===
  'mindmap'`; su un KG è falso e `render()` mette l'empty-state dentro `#elabora-content`, che vive
  nella LANDING — in quel momento nascosta dietro la mappa appena caricata. Nessun overlay, nessun
  messaggio: si restava sul canvas. (Sulle MindMap funzionava già: `#elab-overlay` è `position:
  fixed; z-index:950` e copre `#map-view` — verificato, l'elemento in cima è dentro ELABORA.)
  - **Fix**: l'azione «Elabora» compare solo se la mappa NON è un KG, e la sezione dice perché
    quando manca. In più una **rete** in `_consAvvia`: la condizione la dichiara `MappAIElabora.
    hasMap()` (già esportata — non una copia della regola), e se non regge si avvisa invece di
    lasciare l'utente sul canvas. Serve per i vault **senza progetto**, dove il genere è dedotto
    (`type` default 'mindmap') e può sbagliare: provato con uno snapshot KG dichiarato mindmap →
    toast, nessun cambio di modalità.
  - ⚠️ Tolto anche il `setTimeout(120)` per ELABORA: `loadProject` assegna `appState` in modo
    **sincrono** (rinvia solo il disegno del canvas), quindi la mappa c'è già. Aspettare a caso era
    una scommessa — con un caricamento più lento ELABORA si sarebbe aperta su uno stato vuoto e
    avrebbe prodotto lo stesso sintomo anche su una MindMap. Live e Lavagna tengono l'attesa: lì
    l'hub si apre SOPRA la mappa e vuole il canvas montato.
- 🐛 **Radice vera (2/8): `_consCarica` NON è sincrono.** Il giro precedente era stato misurato con
  progetti in localStorage (`loadSavedProject`, sincrono) e sembrava a posto. In Electron le mappe
  della console vengono dal DISCO e spesso non hanno un progetto: si passa da **`directLoadVault`,
  che è IPC** — asincrono. Agire subito (o dopo 120ms) significava decidere guardando la mappa
  **PRECEDENTE**: con una mappa già aperta ELABORA si apriva su quella, poi il caricamento finiva e
  riportava al canvas — «il bottone porta alla mappa», sia MM sia KG.
  - **Fix**: `_consQuandoPronta(m, poi)` aspetta l'IDENTITÀ giusta — `StorageManager.currentProjectId`
    per i progetti, `appState.activeVaultPath` per i vault — non il numero di nodi (che una mappa
    precedente ha comunque). Tetto ~5s, poi rinuncia con un avviso. Vale anche per Lavagna e Studio
    attivo, che avevano lo stesso `setTimeout` a scommessa.
  - Verificato simulando il ramo Electron (mappe dal disco, `directLoadVault` con 700ms di ritardo):
    subito dopo il clic ELABORA **non** si apre e la modalità resta `build`; a caricamento finito
    l'overlay c'è ed è l'elemento in cima. Sul KG dal disco — dove il genere NON si conosce prima e
    il bottone c'è per forza — arriva l'avviso e la modalità non cambia.
- Verificato nella pagina vera con le funzioni di caricamento spiate: **Mappa** → `loadSavedProject`,
  **Elabora** → `+ MappAIElabora.open()`, **Studio attivo** → `+ MappAILive.openSetup()`, **Lavagna**
  → `+ openCollabHub()`; **Finder** non chiude la console; la × non carica niente. Censite tutte le
  altre azioni e righe della console: hanno già `chiude:false` — il difetto era isolato a queste
  quattro. Regola aggiunta all'handoff §5.

### 🏗️ IN CORSO (29/7/26): sistema dei modali — motore + Officina
Decisioni prese con Giacomo: **motore unico con schema** (i modali diventano dati) · ambito
**modali ora, token predisposti per tutta la UI** · elenco **consolidato prima** (14 archetipi
per i 69 modali censiti) · le tre divergenze aperte **si decidono nell'Officina, dal vivo**.

- **`public/js/mappai-modal-core.js`** (UMD, puro, +19 test in `tests/modal-core.test.js`):
  taglie S440/M600/L820/XL1160 + `tagliaVicina`, `layoutValido` (un cruscotto sotto L non è un
  cruscotto), normalizzazione/validazione dello schema, contrasti WCAG (`verificaPaletta`),
  bersagli touch. Suite **911** (909 pass, 2 skip preesistenti).
- **`public/js/mappai-modal.js`** — il motore: `open(schema)` → Promise, `render(schema)` → nodo
  (l'Officina usa QUESTO per l'anteprima: ciò che si vede è il prodotto, non un disegno).
  Contratto tastiera in un posto solo: ESC, Invio (mai in textarea), focus trap, ritorno del
  fuoco, velo, pila di modali. Scorciatoie `conferma/avviso/chiedi`. Opzione di sistema
  `Modal.stile.etichette` ('dentro' = solo segnaposto · 'sopra').
- **`public/dev/officina.html`** (`node tools/officina/build.js` + `public/dev/officina.js`):
  ① fondamentali (paletta con picker e contrasti calcolati a ogni tocco, forma, le tre aperte)
  ② pezzi con **stati** (riposo/fuoco/disabilitato/errore) e misure lette dal layout
  ③ cantiere: 14 archetipi, taglia e impaginazione per scheda, «Apri» col contratto vero,
  copertura dichiarata ④ uscita: CSS dei token + schema JSON da incollare.
- **Reperti trovati dal sistema stesso**: bordo `#e2e8f0` su bianco = **1,23:1** (il bordo dei
  campi non è percepibile) · bottone della variante C alto **34px**, sotto i 44 consigliati per
  il tocco · in una conferma distruttiva il distruttivo NON va isolato a sinistra (è l'azione
  conclusiva) e il fuoco non si posa mai su di esso.
- **Aperto**: 5 modali statici senza archetipo (`link-family`, `study-config`, `layout-manager`,
  `contextual-ai-extension`, `config-ai`), 8 archetipi ancora in stato *da-fare*, le tre
  divergenze (maiuscolo · etichette · icone 20/22).

**Estensione 30/7 — «Officina dei modali e delle finestre» (procedura dei verdetti).** Il campionario
non vedeva le FINESTRE-DOCUMENTO (il censimento contava solo `id="*modal*"` + overlay `fixed inset-0`):
pagine `window.open` con topbar QP_PRINT_BAR (quiz/flashcard/timeline/credenziali/report live-tutor-consumi),
PDF headless, editor documenti ELABORA, player audio (chip TTS + voce naturale), pagine QR. Censite il 30/7
(tabella per file:riga in sessione) e portate nell'officina:
- **`tools/officina/famiglie.js`** — le famiglie ESISTENTI di bottoni (7) e campi (4), CSS trascritto dal
  codice vero con origine file:riga (per `@apply` il valore prodotto da Tailwind) e problemi noti annotati.
- **`tools/officina/finestre.js`** — 6 famiglie di finestre-documento (stampato · PDF headless · editor ·
  player · pagina QR · fuori-perimetro) con mock a CSS vero, istanze reali e token che servirebbero
  (`--mm-doc-*`, `--mm-bar-*`, `--mm-player-*`).
- **Pagina**: §0 «Verdetti» = procedura in 4 passi (bottoni → campi → superfici → icone), ogni scheda con
  misure lette dal layout e comandi Valida/Invalida + «confluisce in» + nota; §4 finestre col verdetto per
  famiglia; §5 «Assegnazioni» = registro di 92 superfici (statici + overlay nominati + finestre) con tendina
  del gruppo, 87 preassegnate da archetipi/finestre; §6 uscita con due JSON nuovi (verdetti · assegnazioni).
  Stato in localStorage `officina_verdetti` / `officina_assegnazioni`; niente automatismi, conta che Giacomo
  abbia visto. Verificato in browser (server statico, DOM): 22 schede, verdetto → badge/contatore/JSON,
  persistenza al reload, 92 righe, zero errori console; screenshot d'insieme NON possibile (pannello
  `visibilityState: hidden`, trappola §"TRAPPOLE"). **Da fare**: Giacomo dà i 22 verdetti dal vivo, poi
  i token nuovi delle finestre entrano in `mappai-modal-tokens.css` e i JSON si salvano nel repo.

**Archetipo 15 «CONSOLE» (30/7)** — da una schermata di riferimento passata da Giacomo (sidebar di dominio +
schede + filtri + tabella). È il layout che **raccoglie**: una finestra sola al posto di N modali della stessa
famiglia. Suite **913 pass / 0 fail** (+7 test console).
- **Core** (`mappai-modal-core.js`): `LAYOUT` +`'console'` · `layoutValido` → sotto XL ripiega su `cruscotto`
  (260px di navigazione + tabella: a 820 resterebbe un elenco) · `piena` (vista piena, valida SOLO su console)
  · `normalizzaVoce` (navigazione: icona, contatore, attiva) · `normalizzaTabella` (colonne dichiarate una
  volta → `<colgroup>`) · validazione: console senza `nav` = **errore**, righe con celle ≠ colonne = **errore**
  (è il modo in cui intestazioni e celle si scollegano, §10.15), >8 colonne = avviso. Corretto anche
  «modale vuoto»: ora nav e tabella contano come corpo (trovato da un test).
- **Motore** (`mappai-modal.js`): `consoleHtml` = `navHtml` + `schedeHtml` + barra filtri (sezione con
  `colonna:'filtri'`) + `tabellaHtml` con `<colgroup>`, `<th>` sticky, scorrimento della SOLA tabella.
- **Token** (`mappai-modal-tokens.css`): `--mm-console-side: 260px` (**non** 240 come il cruscotto: misurato,
  a 240 «Attività di studio» + contatore veniva troncato — e una voce di navigazione tagliata è il posto
  peggiore dove risparmiare 20px) · `--mm-console-h: 88vh` · `.mm-nav*` · `.mm-schede`/`.mm-scheda` ·
  `.mm-filtri` · `.mm-tab*` · `.mm-box--piena`. **Prima colonna della tabella = identità → va a capo, non
  tronca**; le altre ellissano.
- **Mockup** `node tools/officina/console-mockup.js` → `public/dev/console-mockup.html`: 5 varianti ×
  larghezze VERE 1440 e 1920 (iframe di stessa origine, contenuti caso-peggiore identici, misure lette dopo
  `fonts.ready` e scritte in didascalia). **A** console unica «Gestione» (16 voci) · **B** tre console
  tematiche Registro/Documenti/AI (consigliata) · **C** console dentro un modale XL 1160.
  Esito misurato: A e B **0 troncature** a entrambe le larghezze, 15 righe visibili a 1440 e 23 a 1920;
  **C tronca 2 celle** e mostra 13 righe — il modale fisso non regge questa tabella.
- ⚠️ Due difetti trovati MISURANDO, corretti: (a) `.mm-body--console{flex:1}` = `flex-basis:0` vince su
  `height` in colonna flex → il corpo collassava e si vedevano 4 righe invece di 15 (l'altezza va al
  RIQUADRO); (b) nome di mappa lungo troncato in prima colonna.
- **Da decidere con Giacomo**: A vs B vs C, e quali superfici confluiscono in ciascuna console (§5
  dell'officina ha ora 95 righe e la tendina include i 3 gruppi console).

**Round 2 console (30/7 sera) — area a colonne + proposte D/E.** Su richiesta di Giacomo: console
multi-colonna e due bersagli precisi. Suite **914 pass / 0 fail** (+1 test `area`).
- **Motore**: campo `area: 'una'|'due'|'tre'` = colonne delle sezioni principali della console
  (`.mm-console__sez--2/3`, griglia; tabella e filtri restano a tutta larghezza; `mm-sez--largo`
  prende la riga; senza tabella l'area SCORRE da sola, testata/nav ferme).
- **Gruppo D — Console «Mappa»** (sostituisce `floating-actions-menu`, index.html:1481; contenuto
  censito dal menu vero: 8 hub + Annulla + Home): **D1** griglia delle 22 azioni in 6 riquadri su
  area a 3 colonne, nav che filtra per dominio, azioni di stato nel PIÈ (`invio:false` — un hub non
  ha primario); **D2** dominio «Materiali» attivo: azioni su 2 colonne + contesto mappa nella
  sidebar (sez `colonna:'lato'` accento) + schede Crea/Già prodotti/Condivisi + tabella dei
  documenti della mappa. Modale XL, NON piena (non stai lasciando la mappa).
- **Gruppo E — Console «Cabina»** (raccoglie header-utils della landing, index.html:628-651:
  Config AI · Guida · Tutorial · Profilo + chip classe attiva): **E1** vista Profilo, area a 2
  colonne (Chi sei | Note AI) + «Classe attiva» accento a tutta riga, Salva unico, `sporco:true`;
  **E2** vista AI e chiavi: Provider | Lingua e profondità + totale mese in evidenza + tabella
  ultime chiamate — config e consumi nello stesso posto (config-ai-modal è uno dei 5 orfani).
- **Misurato** (mockup 9 varianti × 1440/1920): D1/D2/E1/E2 **0 troncature, 0 sbordi, 0 overflow
  verticale**; D2 ~9 righe di tabella visibili a 1440 (~17 a 1920), E2 ~6 (~14). Il file è sempre
  `public/dev/console-mockup.html` (gruppi A/B/C/D/E, badge colorati).
- **Da decidere con Giacomo**: D1 vs D2 come sostituto del menu (o menu snello che apre la console
  sul dominio), E come casa dei 4 bottoni header; poi le nav-voci definitive delle console.

**Audit UI integrale + pagina «Rotta» (31/7).** Giacomo si sentiva perso nel riordino → audit con
workflow (8 lenti parallele: landing · cromo mappa · CSS · modali · finestre · icone · a11y · copy;
+ verificatore scettico sui numeri): **95 finding (34 alta), 82/86 numeri confermati**, dati grezzi in
`tools/officina/audit-ui-dati.json`. Diagnosi in una frase: *le decisioni giuste sono già prese ma
vivono solo nei token — 0 modali migrati, e ogni superficie nuova nasce fuori standard*. Reperti chiave:
713 !important (59% delle dichiarazioni di style.css); 6 veli diversi; emerald/rosso ancora colori
d'azione (CTA landing emerald 1,92:1); 71 uppercase + 53 tracking larghi; 1 solo attributo ARIA in
index.html e :focus-visible usato solo per SOPPRIMERE il fuoco; topbar stampa clonata in 13 file con
3 glifi stampante diversi; 26 bottoni solo-icona senza nome; z-index fino a 2147483647; «File
condivisi» orfano (renderSharedMat senza contenitore); ~107 righe CSS morte di #projects-bar.
**Bug trovato e CORRETTO**: `normalizzaCampo` scartava `gruppo` dei radio → tutti i radio di un
modale nello stesso name (+ test regressione; suite **915/0**).
- **`tools/officina/rotta.js`** → `public/dev/rotta-ui.html` = pagina di REGIA (non un 4° strumento):
  §1 bussola dei 4 artefatti (campionario=fotografia · officina=banco · mockup=confronto · rotta=regia,
  con contatori vivi da localStorage) · §2 audit sfogliabile con filtro gravità · §3 **coda delle
  14 decisioni in 3 fasi** con consiglio+link+spunta persistita (`rotta_stato`) · §4 quick wins.
- Coda: FASE 1 fondamenta (22 verdetti · bordo campi ≥3:1 · corpo bottoni 13px/bersaglio 44 ·
  **riaprire decisione 4: consiglio etichetta SOPRA il campo**, il solo-segnaposto è fragile per
  BES/DSA · ratifica icone 20/22) → FASE 2 architettura (B tre console · D2 · E Cabina · assegnazioni)
  → FASE 3 esecuzione (adozione motore sui 6 overlay landing + t() nel motore · pensionamenti ·
  token finestre/printBar unica · a11y trasversale · pulizia CSS). Nav dell'officina linka la Rotta.

**FASE 1 CHIUSA (31/7 sera) — i 22 verdetti di Giacomo + le 5 fondamentali, APPLICATE nei token.**
Verdetti letti dal suo browser via Claude-in-Chrome e salvati in
`tools/officina/verdetti-2026-07-31.json` (22/22 + decisioniFondamentali). Suite **935/0** (+3 test).
- **Esiti verdetti**: TUTTI i bottoni → `mm-btn` (pm, salva/annulla, moduli); TUTTI i campi →
  `mm-campo` **compresa la landing** (scelta di Giacomo, più ambiziosa della proposta); barre editor →
  token `--mm-bar-*` (b-de e w-editor validati con quella destinazione); topbar stampati →
  `--mm-doc-*`; player → `--mm-player-*`; pagine QR fuori perimetro; **w-fuori INVALIDATO** = pagine
  studente LAN e voxel rientreranno nello standard in una fase futura; s-taglie: 4 taglie + console
  come quinta forma (da finire di definire in Fase 2).
- **Fondamentali decise e applicate in `mappai-modal-tokens.css`**:
  1. **Icone 20 nei bottoni / 24 in testata** (--mm-icona-head 22→24; `.mm-btn svg` non più ×0.8 ma
     20px pieni — parole di Giacomo: «icone 20 su bottoni, 24 in testata»).
  2. **Bordo campi INVISIBILE per scelta**: `.mm-campo` border transparent + riempimento #f1f5f9 su
     fondo bianco / bianco dentro `.mm-sez`; disabilitato #e2e8f0; errore resta bordo rosso. Nel core
     `esitoContrasto` ha il tipo `'decorativo'` (nessuna soglia) e la prova paletta del bordo è ora
     «bordo dei riquadri (decorativo)».
  3. **Corpo bottoni 14px + `--mm-btn-pad-y` 13px** → bersaglio misurato **47px** («bersaglio comodo»).
  4. **Etichette solo segnaposto CONFERMATA** + regola nuova: un gruppo di 2+ campi scritti porta il
     TITOLO di sezione (l'indicazione che resta a campi compilati) — `validaSchema` emette avviso
     se manca (+test).
- Officina §1 aggiornata (le «tre aperte» ora dicono DECISA), Rotta FASE 1 marcata CHIUSA con gli
  esiti al posto dei consigli. Riallineati anche i comandi §1 nel browser di Giacomo via MMOfficina2.
- ⚠️ Trappola vista: il pannello browser serviva l'officina VECCHIA dalla cache + `officina_token`
  di prova → misure stantie (bottone 36px). Dopo hard-reload + rimozione chiave: 47px/14px/20-24px,
  contrasti «tutti sopra soglia». Verificare sempre su pagina fresca.
- **Prossimo (Fase 2)**: definire e ottimizzare la console con Giacomo (B · D2 · E sono i consigli
  sul tavolo), poi §5 assegnazioni → Fase 3 esecuzione.

**Round 3 console (31/7) — il riesame di Giacomo ricompone l'architettura.** Le sue tre osservazioni
sulle console B hanno corretto una proposta sbagliata: **B non sono tre console sorelle, è UN percorso**.
Suite **940/0** (+6 test). Mockup: 9 varianti (b-ai eliminata, b-accessi nuova).
- **Contesto della console** (`contesto: [{etichetta, icona, azzerabile}]` nel core, chip in testata
  `.mm-ctx`): la selezione classe+disciplina vale per TUTTA la console e sopravvive al cambio di vista.
  È il pezzo che trasforma finestre scollegate in un percorso, e rispecchia il disco
  (`Mappe/<classe>/<disciplina>/<mappa>`). Osservazione di Giacomo: «non avrebbe senso passare ai
  documenti dopo che nel registro ho selezionato classe e disciplina?» → sì, ed è ora così.
- **«Credenziali» → «Accessi allievi»**: la parola era ambigua (Giacomo l'ha letta come credenziali API
  → da lì la domanda «AI non dovrebbe essere la console di Credenziali?»). Sono le identità emoji+numero
  del QR (`buildCredentials`), non le chiavi. Vista nuova B③ con foglio da distribuire, chi è entrato,
  rigenerazione distruttiva.
- **Console «AI» di B ELIMINATA**: era la stessa cosa di E2·Cabina, proposta due volte. L'AI vive nella
  Cabina. «Profilo insegnante» esce dal Registro (parla di me, non della classe) → Cabina.
  Architettura finale a 4 console, una per entità: **Registro** (la classe) · **Mappa/D2** (la mappa
  aperta) · **Cabina/E** (io e l'app) · + la console è anche il layout di ELABORA·Documenti.
- **`dati` nelle sezioni** (`normalizzaDati` + `<dl class="mm-dati">`): una riga per fatto, etichetta →
  valore. Richiesta di Giacomo su D2 («le info tecniche una per riga»): in un paragrafo unico i cinque
  numeri si leggono come prosa e ci si perdono. Usato in D2 «Questa mappa» (7 righe), E2 «Questo mese»,
  B③ «Come funziona». Tollerante: `'Vault: sincronizzato alle 14:02'` si spezza al PRIMO `:`.
- ⚠️ **`.mm-nota` era emessa dal motore senza CSS** (testo nudo) — trovato e corretto.
- ⚠️ **Token `--mm-console-side` 260 → 280, misurato**: «Attività di studio» e «Materiali di studio»
  (con contatore) chiedevano **9px** in più. Aggiunto `scrollbar-gutter: stable` sulla navigazione —
  senza, le etichette si accorciavano SOLO quando la console aveva molte voci e la colonna scorreva
  (la variante A a 16 voci troncava, quella a 6 no: stesso CSS, esito diverso).
- **Esito misurato** (1440 e 1920): tutte le varianti **0 troncature, 0 sbordi, 0 overflow verticale**;
  resta solo **C** (console dentro modale XL 1160) con 2 celle tagliate — la prova che il modale fisso
  non regge questa tabella. D1 approvato da Giacomo (nomi dei bottoni da rivedere), E1 approvato.
- **Aperto**: da dove si apre il Registro (INSEGNA della landing è il candidato naturale: le sue tre
  sezioni SONO già quelle della console), e i nomi dei bottoni-azione di D1.

**Round 4 console (31/7) — chip di contesto, tela, ruolo Sostegno/OPI, le 4 console.** Suite **944/0**
(+4 test; un fallimento di `relay-server` era intermittente — passa da solo e al secondo giro).
- **Chip di contesto** (`contesto` + `.mm-ctx`, `MappAIModal.chipContesto(parti)`): UN chip diviso in
  metà cliccabili «classe/allievo · disciplina», richiesto per COSTRUISCI · ELABORA · INSEGNA. Stesso
  componente in due posti — barra della landing e testata delle console — perché è la stessa
  informazione. Stati: vuoto (invito, `--mm-testo-3`), pieno, misto, allievo. `scegli` = metà
  cliccabile (default) · `azzerabile` = × opzionale (**default cambiato a false**: una metà è un
  SELETTORE, si azzera scegliendo «tutte le classi», non con una crocetta; la × resta per le parti
  aggiunte al volo come il documento aperto). Misurato: **44px** di altezza (era 34: sotto il tocco),
  metà max **300px** (il nome «Gian-Luca Pellegrini-Rossi» chiedeva 8px in più di 260 — tagliare il
  nome di una persona è peggio che allargare il chip) + `title` col testo intero.
- **Tela** (`tela: {segnaposto, altezza}` + `.mm-tela`): lo spazio libero dell'area, che il chiamante
  riempie con ciò che il motore non sa disegnare (editor, grafico, mappa). Senza, una console poteva
  ospitare solo tabelle. `tabella` + `tela` insieme = **errore** (si contendono lo spazio).
- **Console «Documento» (F1/F2)** — risposta alla domanda di Giacomo: la console NON si apre dopo aver
  scelto un documento, è il **guscio sempre presente** di ELABORA·Documenti. F1 elenco (nav = tipi,
  tabella = documenti) → F2 il documento entra nella TELA, la barra dell'editor prende il posto dei
  filtri, il nome si aggiunge al chip. Non si esce mai dal guscio: si passa da un documento all'altro
  senza tornare indietro e la navigazione resta visibile mentre si scrive. `sporco: true`.
- **Ruolo «Docente di sostegno / OPI»** (categoria unica) nel profilo della Cabina E1: radio
  materia/sostegno + servizio di riferimento. È il **gate** dei profili individuali degli allievi —
  con quel ruolo dichiarato, la prima metà del chip può contenere un ALLIEVO al posto della classe in
  tutti e tre i tab. Motivo scritto nel mockup: i dati di un allievo con misure compensative sono
  sensibili, si aprono dichiarando il ruolo che li giustifica.
- **Le quattro console** (mockup, 11 varianti + sezione CHIP): **Registro** (la classe) · **Mappa/D2**
  (la mappa aperta) · **Cabina/E** (io e l'app) · **Documento/F** (ELABORA). Misurato a 1440 e 1920:
  **0 troncature, 0 sbordi, 0 overflow** ovunque tranne **C** (console dentro modale 1160, 2 celle) —
  la variante scartata.

**Round 5 console (31/7 sera) — le correzioni di Giacomo, punto per punto.** Suite **947/0** (+3 test).
Tre pezzi NUOVI del motore, non solo ritocchi al mockup:
- **Celle di scelte** (`{scelte:[…], azione}` in `normalizzaTabella` → `.mm-scelta`): nella tabella
  classi del Registro le DISCIPLINE sono cliccabili e attivano subito quella coppia
  classe+disciplina, che entra nel chip di contesto. Percorso più corto fra «vedo» e «lavoro su».
- **Navigazione richiudibile** (`navChiudibile`/`navChiusa` + `.mm-nav__cerniera`/`.mm-riapri`):
  quando l'area ospita un editor, i 280px della colonna sono spazio tolto a chi scrive. Chiusa
  (`display:none`) resta il solo comando per riaprirla nella riga delle schede — il core avvisa se
  `navChiusa` senza `navChiudibile` (navigazione irraggiungibile). F2 è mostrata già chiusa: **tela
  1336px**.
- **Suggerimento al passaggio con attesa** (`.mm-tip`, in `attaccaTip`): compare SOLO se il testo è
  davvero troncato (misurato al momento) e SOLO dopo **900ms**. Verificato: 0 fumetti a 400ms, 1 a
  1100ms col testo intero, 0 su celle non troncate, sparisce all'uscita. Con questo, la prima colonna
  della tabella **torna a troncare con l'ellissi** invece di andare a capo (decisione rovesciata
  rispetto al round 2: righe di altezza uguale si scorrono meglio, e il nome intero è nel fumetto).
- **D1 rivista**: via «AI sulla mappa»; «Elabora ↗» e «Genera materiali» diventano VOCI di
  navigazione (la prima porta a ELABORA a tutto schermo, la seconda apre le sue opzioni); nuova
  sezione+voce **Jigsaw** (vault per gruppi · ricomponi · lacune · **Revisione**); «MappAI Live» →
  «Live»; «Unisci un'altra mappa» → «Unisci mappe»; **«Studio attivo» resta voce ma esce dalla
  griglia** (si accende solo col profilo di un allievo attivo).
- **D2 asciugata**: «Stampati già prodotti» = solo accesso a ciò che esiste (la generazione ha la sua
  vista); «Da consegnare» = due bottoni soli (QR con l'elenco pronto · file dal computer). Via Jigsaw
  e Genera materiali.
- **E2**: «AI e chiavi» → **«Impostazioni AI»**, e il riquadro «Questo mese» tolto — i numeri di spesa
  vivono nella vista «Consumi», non duplicati dove si configura.
- **Altre**: tendina mappe di B② → «Mappe»; «Come funziona» tolta da B③; chip vuoto → **«Classe»** e
  **«Materia»**; ELABORA (F1/F2) a tutto schermo con navigazione richiudibile.

**Round 6 console (2/8) — materie, bollino, ELABORA da bordo a bordo.** Suite **949/0** (+2 test).
- **Le materie hanno UNA fonte**: `MATERIE_PROFILO` nel mockup — la tabella delle classi e il campo
  del profilo (Cabina E1) leggono la stessa costante, così non possono divergere. Colonna
  «Discipline» → **«Materie»**; nel profilo il campo è «Materie che insegni».
- **Colonna CLASSE senza descrizione** (`4R (recupero, sostegno pedagogico)` → `4R`) + **bollino**
  di stato: verde = taratura AI attiva, grigio = nessuna. Pezzo nuovo del motore
  (`{testo, bollino, titolo}` nelle celle + `.mm-bollino`): il pallino **porta sempre `title` e
  `aria-label`** — il colore da solo è un canale che non tutti leggono.
- **Azioni in TESTATA** (`azioniTestata` + `.mm-head__az`): per le console a tutto schermo, dove un
  piè di pagina sarebbe una riga sprecata in fondo. F2 non ha più piè: un solo comando **«Chiudi»**
  in testata che riporta all'elenco (F1). «Esci da ELABORA» **eliminato** — si esce dall'elenco, non
  dall'editor: due uscite vicine sono due modi di sbagliare.
- **`piena` ora è da bordo a bordo**: 100% + raggio 0 + niente ombra, e `.mm-overlay:has(>.mm-box--piena)`
  azzera il padding del velo. Misurato su F2: riquadro **1438×905 = esattamente il contenitore**,
  tela **1394px**.
- **F1**: voce **«Fonte»** in cima alla navigazione — ELABORA ha due anime (analisi della fonte /
  documenti) e senza quella voce la console dei documenti non saprebbe tornare all'altra.
- ⚠️ Errore mio corretto subito: nel rendere le azioni in testata avevo scritto
  `tutte.concat.apply([], …)`, che avrebbe perso azioni e azioniTestata dalla ricerca del gestore.
- **F2, il documento sta nel SOTTOTITOLO, non nel chip** (2/8): forma
  `ELABORA · [tipo di documento] · [nome mappa]`; il chip resta al contesto (classe · materia), che
  non cambia passando da un documento all'altro. Misurato col nome di mappa peggiore: sottotitolo su
  una riga, testata 71px, tela 1394×679 a 1440 e 1874×982 a 1920.
- **D1 senza «Tutte le azioni»** (2/8): la voce era ridondante — la console SI APRE già mostrando
  tutto, e lo dichiara il sottotitolo. Restano le 7 voci di dominio come FILTRI, nessuna attiva
  all'apertura. Affinata di conseguenza la regola del core: l'avviso «nessuna voce attiva» scatta
  solo se esiste una vista specifica (tabella, schede o tela) — una griglia di azioni non è «da
  nessuna parte», è lo stato senza filtro. Verificato: D1 valida senza avvisi, D2 conserva la sua
  voce attiva.
- **B② scheda «Mappe»** (2/8): dopo «Tutti», raccoglie MindMap e Knowledge Graph — per il docente
  due forme della stessa cosa. Erano l'assenza più grossa: l'elenco della classe mostrava i
  materiali ma non le mappe che li generano (e su disco stanno nella stessa cartella di classe).
  Aggiunte due righe di mappe in cima alla tabella; colonna «Classe · disciplina» → «Classe · materia».
- **Rinomine (2/8)**: D1 «Lavagna collaborativa» → **«Lavagna»**, «Chatta e Scrivi (Tutor)» →
  **«Rispondi e Domanda»**; voce **«Elabora»** senza la freccia ↗ (era un glifo infilato
  nell'etichetta: le icone le disegna Lucide, la regola dell'11/7 vale anche qui — verificato zero
  frecce residue). D2: «Da consegnare» → **«Consegna via QR»**, «Scegli un file dal computer» →
  **«Scegli file»**.
- **`sotto` nelle sezioni** (+ `.mm-sez__esito`, +1 test): riga di ESITO sotto le azioni — dice cosa
  è stato scelto o com'è andata. Sta sotto perché è la conseguenza del bottone, non la sua
  spiegazione (quella resta sopra, in `testo`). Prima applicazione: il nome del PDF caricato in
  D2 «Consegna via QR». Verificato che sia reso davvero SOTTO la fila dei bottoni.
- **Round 7 (2/8)**: `colonna:'barra'` = comandi sulla STESSA riga delle schede, spinti a destra
  (F2: schede e comandi parlano dello stesso documento, due righe rubavano altezza al foglio —
  verificato: centri allineati a 122px, riga unica da 49px) · **intestazioni di gruppo nella
  navigazione** (`{gruppo:'…'}` → `.mm-nav__g`, non cliccabili e non contate come voci, +3 test):
  la console unica A ha ora le 16 voci divise per ENTITÀ (La classe · Documenti · AI · Io e l'app)
  — le stesse quattro che in B sono quattro console · colonna «Documento» di B② accorciata **del 45%**
  (444→**244px**, con «Contenuto» come colonna elastica così la misura tiene a ogni larghezza; il
  nome intero resta nel fumetto — verificato) · `sotto` = riga di esito · **nomi dei bottoni senza
  articoli** (regola generale di Giacomo): Genera vault · Ricomponi vault · Lacune · Sintesi ·
  Foglio nodi · Sincronizza vault · Apri Studio · Importa piano · Stampa tessere · Rigenera accessi ·
  Gestisci profili · Condividi · Annulla.
- **Colonna «Classe · materia» dalla fonte unica (2/8)**: Giacomo ha chiesto di «allineare i
  contenuti al titolo della colonna». Misurato: l'allineamento VISIVO era già esatto (th e td
  condividono il bordo sinistro in tutte le colonne) — il disallineamento era nei DATI: una riga
  diceva «Scienze» dove la materia dichiarata nel profilo è «Scienze naturali». Ora la colonna si
  costruisce con `CM(classe, indiceMateria)` da `MATERIE_PROFILO`: scritta a mano riga per riga era
  già divergente, e lo sarebbe tornata. Verificato: tutte le materie citate esistono nel profilo.
- **E1 profilo rivisto (2/8)**: via «Note per l'AI» — le attenzioni stanno sulla CLASSE
  (`buildTuningBlock`), non sul docente. Campo nuovo del motore **`elenco`** (`valori` + `aggiungi`,
  `.mm-elenco`, +2 test): **Sedi** e **Materie** diventano elenchi a cui si aggiungono voci — chi
  insegna in due istituti o cinque materie non deve più sceglierne una e correggere a mano. Il core
  avvisa se un elenco non dichiara l'etichetta di aggiunta (un «+» da solo non dice cosa aggiunge).
  Nuova sezione **«Ora di classe»** (spunta «Sono docente di classe» + classe di riferimento),
  tenuta FUORI dalle materie: non ha contenuti disciplinari e produce materiali di altro genere —
  dentro l'elenco delle materie l'AI la tratterebbe come una materia.
**Round 8 (2/8) — tabelle: allineamento unico, ordinamento e colonne trascinabili.** Suite **958/0**
(+2 test). Risposta a una domanda di Giacomo, costruita invece che descritta.
- **Tutto a sinistra** (decisione sua): tolti gli `allinea:'centro'/'destra'` da tutti i mockup —
  colonne allineate diversamente rendono irregolare la lettura verticale, l'occhio cerca un solo
  bordo di partenza. `allinea` resta nel core come deroga esplicita, non è più il modo normale.
- **Ordinamento cliccando l'intestazione** (`ordinabile`, default ON): `chiaveOrdine` confronta
  DATE `GG/MM/AAAA` e NUMERI all'italiana (`1.204.860`, `CHF 2,31`) per quello che sono — come
  stringhe «10/07» verrebbe prima di «9/07» e «CHF 2,31» prima di «CHF 12,00». Confronto **stabile**
  (le righe che pareggiano non si rimescolano), `aria-sort` sull'intestazione, freccia che occupa il
  suo posto anche da spenta (senza, l'intestazione ballerebbe al primo clic).
  Verificato: date 18→30 luglio crescenti, invertite al secondo clic, classi 1ª A→4R.
- **Colonne trascinabili** (`ridimensionabile`, default ON): maniglia sul bordo destro di ogni
  colonna tranne l'ultima. Al primo trascinamento tutte le colonne fissano la larghezza che hanno
  in quel momento — senza, le altre salterebbero. Minimo 70px. Verificato: prima colonna 210→300px
  tirando di 90px.
- ⚠️ Falso positivo della MIA misura, non un difetto: la maniglia è assoluta e sporge 3px oltre la
  cella, quindi `th.scrollWidth > clientWidth` segnalava tutte le intestazioni. Verificato che la
  tabella non sbordi davvero (`.mm-tab-wrap` scrollWidth = clientWidth ovunque); la misura ora
  guarda l'etichetta dentro il `th`.
- Difetto vero emerso: «Allievi» a 80px non entrava più (la freccia chiede il suo posto) → **96px**,
  deficit misurato 5px. E due colonne dicevano ancora «Classe · disciplina» → «Classe · materia».
- **B③**: «Rigenera accessi» (distruttivo) sostituito da **«Aggiungi allievo»** — il bisogno vero è
  l'allievo che arriva a metà anno; rigenerare invaliderebbe le tessere già consegnate a tutti gli
  altri. Zero bottoni distruttivi in quella vista.
- **A**: via la voce «Taratura per classe» dal gruppo AI — ci si arriva dalla gestione della classe.

**Round 9 (2/8) — la console prende la sua forma definitiva.** Suite **958/0**. Le richieste di
Giacomo su schermata reale, tutte misurate:
- **Maniglia sul CONFINE** (`.mm-console__man`, su disegno di Giacomo): linguetta col chevron a
  cavallo del bordo fra colonna e area; chiusa scivola sul bordo sinistro e la freccia si gira.
  `navChiudibile` è ora **default true** → tutte le console ce l'hanno; via la vecchia cerniera in
  cima alla nav e il bottone di riapertura fra le schede. Verificato su B①: colonna 272→0,
  maniglia da x=260 a x=0, area a 1438px, riapre.
- **Colonna a tutta altezza**: `nota` e piè scendono DENTRO l'area della console — fuori,
  lasciavano sotto la colonna una fascia bianca a tutta larghezza. Verificato: scarto 0 su tutte.
- **Margini del riquadro di contesto pari**: era 12 a sinistra e **28** a destra perché
  `scrollbar-gutter: stable` riservava 15px solo a destra. Tolto (resta `scrollbar-width: thin`),
  colonna 280→**272**. Ora 12 / 13.
- **F2 da bordo a bordo**: `.mm-box--piena:has(.mm-tela)` azzera il padding dell'area e la tela
  perde raggio e bordi laterali. Misurato: **0px** a destra, sinistra e sotto.
- **Chip compatto** (`mm-ctx--compatto`, `chipContesto(parti, {compatto:true})`): via le freccette,
  padding stretto, icone 15px, classe senza spazio («1ªA»). **−19%** di larghezza media, altezza
  43px (il bersaglio resta comodo: si stringe la larghezza, non il tocco). Il mockup mostra le due
  forme una sotto l'altra con le misure a fianco.
- **Colonna «Classe · materia» divisa in due** (F1 · B② · D2): sono due dati, vanno in due colonne.
- **B①/A**: «Classe» 210→**168px** (−20%); chip delle materie −20% (font 10, padding 2/8 → 55px).
  ⚠️ «Allievi» non poteva scendere del 20%: a 77px l'etichetta con la freccia di ordinamento si
  troncava — fermata a **85px**, il minimo misurato.
- **Variante C eliminata** (console dentro un modale XL): era l'unica che troncava, non serviva più.
- ⚠️ **Trappola trovata verificando**: le pagine-iframe erano servite dalla CACHE e mostravano lo
  stato di due giri prima — misure giuste su codice vecchio. Il loro `src` non aveva il marcatore
  di versione che invece CSS e JS avevano già. Aggiunto `?v=<mtime>` anche lì.
- **Round 10 (2/8) — approvati e resi definitivi**: la forma **compatta del chip è ora l'UNICA**
  (via il chevron dal markup e il modificatore `--compatto`: una forma sola, non due da mantenere).
  Misure: 158-464×43px secondo il contenuto. La classe si scrive stretta **«1ªA» nel chip** e per
  esteso «1ª A» in tabelle e tendine — il chip è display, il dato non cambia.
  **Maniglia discreta** (sul secondo disegno di Giacomo): 22×26, raggio 6, **niente ombra**,
  opacità .75 → 1 al passaggio, chevron 13px. Non deve competere con le voci di navigazione: è un
  comando che si usa una volta.

- **Tre difetti trovati dal VALIDATORE stesso mentre verificavo B②**, tutti corretti: (a) il mio
  avviso «sezione senza titolo» scattava sulla barra dei FILTRI — falso allarme, quei campi non si
  «compilano e si lasciano», governano l'elenco sotto e il loro effetto si vede subito → la regola
  ora salta `colonna:'filtri'` (+test); (b) `invio` era attivo su 5 console senza azione conclusiva
  → `invio:false` (in un editor Invio scrive, in un elenco non deve chiudere la console);
  (c) E1/E2/F2 sono `sporco` ma il clic sul velo le chiudeva, perdendo il lavoro → `veloChiude:false`.
  Ora tutte le 11 varianti passano con **0 errori e 0 avvisi**. Suite **950/0**.


### 🎨 IN CORSO (29/7/26): campionario dei modali → 7 decisioni di design, 1 già nel codice
Pagina rigenerabile `public/dev/campionario-modali.html` (`node tools/campionario-modali/build.js`):
estrae i **25 modali statici** da `index.html` (markup vero, neutralizzato) + **44 overlay dinamici**
dai moduli, li rende col CSS vero dell'app, e misura le divergenze (29 larghezze · 14 veli · ESC su
16/25 statici e 18/44 dinamici · Invio su 3/44 · zero focus trap). Ha un **banco di prova** che applica
i token ai campioni con stili inline (taglia, velo, raggi separati box/campi/bottoni, densità, ombra,
colore e allineamento delle etichette, icone, «Apri come modale» per provare ESC/Invio/Tab), una
**Officina** che disegna un modale campione dai token (testata, corpo 1-3 colonne o cruscotto, piè di
pagina, campi) ed emette il CSS, e il **piano di migrazione** in §8.

**Decisioni prese con Giacomo** (dettaglio e motivi in `public/css/mappai-modal-tokens.css`, §6 della pagina):
1. un solo colore d'azione, indigo `#4f46e5` — l'emerald torna a essere stato positivo, non bottone;
2. rosso solo per il distruttivo — «Annulla» bianco con bordo (oggi `btn_annulla_action` è rosso);
3. bottoni in tondo, spaziatura normale (via MAIUSCOLO + `letter-spacing:.2em`: costo BES/DSA);
4. campi con **solo segnaposto** — obbligatori `aria-label` su ogni campo e segnaposto `#64748b` (4,76:1);
5. piè di pagina a destra, bottoni a larghezza naturale (il `flex-1/flex-2` di `pm-*` sfonda a 1160px);
6. velo unico `rgba(15,23,42,.45)` + blur;
7. **applicato al codice**: `style.css:87` non applica più `font-size:16px !important` a `button` nudo.
   Ora `button { font-size:16px }` senza `!important` (un px assoluto è già immune allo zoom testo).
   ⚠️ **CORRETTO il 2/8, misurando in Electron**: la stima «~104 bottoni cambiano corpo» era SBAGLIATA.
   I 46 dichiarati in `index.html` (le famiglie `.pm-*`, `.btn_*`) NON cambiano: sono definiti con
   `@apply` dentro `@layer components` (index.html:79) e le **regole in layer perdono contro le
   regole non in layer**, a prescindere dalla specificità — quindi `button { font-size:16px }` di
   `style.css:119` continua a vincere anche senza `!important`. Verificato con un esperimento in
   browser: classe in layer → 16px · stile inline → 12px.
   **Cambiano solo i ~72 bottoni con `font-size` INLINE nei moduli JS** (live-classes,
   teacher-profile, tutor-teacher, menu-hubs, landing-teach, material-pipeline, studio-view…): lo
   stile inline batte una regola non-important. Lì il corpo è sceso a 11-13px.
   Conseguenza pratica: i modali `.pm-*` (edit nodo, config AI, profilo, hub) sono rimasti identici
   — Giacomo l'ha notato subito e aveva ragione.
   Corretto anche il segnaposto: default Tailwind `#9ca3af` (2,9:1) e `.landing-input` `#94a3b8` (2,8:1)
   → entrambi `#64748b`.

8. **campi e bottoni = variante C**, quella dei moduli (§4.3/§4.4 del campionario):
   campo `FLD` (live-classes/tutor/profilo insegnante) = bordo `#e2e8f0`, raggio 10, padding 9×11,
   `font:inherit` → **16px**, altezza 44; bottone (hub/classi/editor documenti) = raggio 10,
   padding 9×14 (16 sul primario), corpo **12px** peso 700, secondario bianco con testo `#334155`.
   ⚠️ 12px sul bottone contro 16px nel campo è uno scarto forte e fino al 29/7 quel 12px non si era
   mai visto (lo scartava `button 16px !important`): leva unica `--mm-btn-fs`, e nel banco c'è il
   comando **Corpo** (12·13·14·16) per confrontarlo sui campioni veri.

**Toggle originale ↔ proposta (29/7)**: ogni scheda del campionario ha un interruttore che rimonta il
modale sui token. Dove esiste una versione **scritta a mano** (`tools/campionario-modali/proposte.js`,
per ora `dyn-pipeline`) si mostra quella, marcata «proposta ✱»; altrimenti si genera una **bozza
automatica** dal DOM dell'originale (titolo → `mm-head`, riquadri → `mm-sez`, campi → `mm-campo`,
bottoni → `mm-btn`), dichiarata come bozza. Nessuna perdita silenziosa: i campi fuori dai riquadri
finiscono in «Altri campi» (solo `input[type=file]` è escluso di proposito), i bottoni interni restano
nella loro sezione e nel piè di pagina vanno solo le azioni finali. La proposta vive dentro `.prop-skin`
(raggio 24, padding 28, icone 24, spazio 12, bottoni maiuscoli con spaziatura .2em) e **il banco non ci
dipinge sopra**: governa gli originali.

**Primo ridisegno vero — «Genera materiali» a cruscotto**: da colonna 600px con 5 riquadri impilati a
1160px con barra laterale (destinazione · preset · costo stimato sempre visibile) e i tre materiali
affiancati. Motivo: nella versione a colonna la stima delle chiamate AI sta in fondo, fuori schermo
mentre spunti le opzioni — il numero che dovrebbe guidare la scelta non lo vedi mentre scegli.

⚠️ **Il CSS della proposta diverge da tre decisioni prese**: bottoni MAIUSCOLI con `letter-spacing:.2em`
(contro la 3), etichetta sopra il campo invece del solo segnaposto (contro la 4) e
`--mm-testo-3:#94a3b8` che porta il segnaposto a 2,8:1 (contro la 4b, che chiedeva ≥4,5:1). Da
riconciliare prima di portare il cruscotto nel codice vero.

**Aperta**: taglia delle icone, 20px vs 22px (nel codice 18 usi contro 17). Nei token: 20 nel corpo, 22 in testata.

**Passo ② del piano fatto (29/7)**: `public/css/mappai-modal-tokens.css` è ora **caricato** in
`index.html` subito dopo `style.css`. Verificato a pagina caricata: variabili `--mm-*` risolte, 34 regole
`.mm-*` presenti, **zero elementi colpiti** — nessun modale usa ancora quelle classi, quindi nessun
cambiamento visivo. Da qui in avanti un modale si porta sullo standard cambiandogli le classi, senza
toccare CSS globale. Prossimi passi in §8 della pagina: ③ riscrivere `pm-btn-*` e pensionare
`btn_salva_action`/`btn_annulla_action`, ④ una sola `openModal()` col contratto tastiera.

### ✅ FATTO (29/7/26): disciplina per classe — cartelle, scelta alla generazione, colonna in tabella
Richiesta utente: il profilo insegnante elenca più discipline → la CLASSE deve dire quali si
insegnano lì; con 2+ discipline la generazione chiede classe **e** disciplina; il filesystem crea
una cartella per disciplina dentro la classe; le tabelle di ELABORA e INSEGNA hanno la colonna
DISCIPLINA (tabelle allargate). Suite **890 pass / 0 fail** (+2 test, 2 skip preesistenti).

- **Modello**: `cls.disciplines: []` (array, sottoinsieme delle discipline del profilo insegnante).
  Contesto attivo: `localStorage mappai_active_discipline`. Helper in `mappai-live-classes.js`:
  `disciplinesOf(cls)` · `disciplineChoices(cls)` (le sue; se vuote ripiega sull'elenco del
  profilo) · `activeDiscipline()`/`setActiveDiscipline()` · **`effectiveDiscipline(cls)`** =
  disciplina valida SOLO se coerente con la classe (con 2+ e nessuna scelta → `''`, mai
  indovinata). La disciplina entra anche in `buildTuningBlock` → l'AI sa la materia.
- **UI classi**: `disciplineField()` = pillole a spunta nei DUE form (crea + gestisci), visibile
  solo se il profilo dichiara almeno una disciplina (stessa regola di `sedeField`). Le discipline
  già sulla classe ma tolte dal profilo restano in elenco: toglierle dal profilo non deve
  orfanizzare le cartelle esistenti. Salvataggio condizionato alla presenza del campo (un profilo
  senza discipline non azzera quelle della classe). Sottotitolo della riga classe = discipline.
- **Generazione**: `MappAIClasses.ensureGenerationContext()` → Promise `{classId, className,
  discipline}` o `null` (annullato). Chiamata in testa a `startGeneration` **prima di spendere
  token**; risultato in `appState.generationDiscipline`. Chiede SOLO con classe attiva a 2+
  discipline (decisione utente: una sola → parte diretta). Il modale ha le due tendine legate
  (cambiando classe si ricaricano le sue discipline); ✕, velo e Annulla risolvono `null` — senza
  questo la promise resterebbe appesa e la generazione non ripartirebbe più.
- **Filesystem**: `Mappe/<sede-classe>/<Disciplina>/<Nome mappa>/`. Unica fonte del nesting:
  **`FilesCore.mapVaultParents(classDir, discipline)`** → `[]` · `[classe]` · `[classe, disciplina]`
  (+ `disciplineFolder()`), usata da auto-vault (`mappai-vault-io.js`), backfill
  (`mappai-landing-teach.js`) e pipeline materiali. Senza classe non c'è disciplina → la mappa
  resta flat. `get-all-vaults` scandisce ora **3 livelli** (si ferma lì: una cartella spuria non
  fa esplodere la scansione) e ritorna `discDir`; classi senza discipline restano a 2 livelli.
  La collisione « · 0N » si calcola sui fratelli della STESSA coppia (classe, disciplina).
- **Progetto**: `pMeta.disc` (nome) + `pMeta.discDir` (cartella), congelati come `cls`/`clsId`.
  `matchProjectToVault` confronta anche `discDir`, con ripiego sui progetti scritti prima
  (classDir sì, discDir no) → nessuna riga persa.
- **Tabelle**: colonna DISCIPLINA (chip **ambra** `book-open`, distinto dal chip classe indaco)
  dopo CLASSE in `fileTable` **e** `actTable` → arriva in un colpo a Progetti, Materiali, Quiz
  cartacei, File condivisi, Attività/report e ai Progetti di ELABORA. Fonte del dato: cartella su
  disco (`v.discDir`) → `p.disc` → `discOfMap(mapName, projectId)` per le righe che sanno solo da
  quale mappa vengono. `MappAIStudyDocs.save` registra `disc` (default = `effectiveDiscipline`).
- **Larghezza**: token condiviso della landing **1100 → 1240px** in `style.css` (§10.16: si alza
  su tutti e tre i tab insieme, mai per tab). ⚠️ La regola vive dentro `@media (min-width:768px)`:
  in un pannello browser stretto NON si applica e la misura torna quella dei contenitori interni.
- ✅ Verificato in browser (server statico, `#beta-lock-screen` rimosso lato-DOM, viewport 1600):
  `<col>` = `<th>` = `<td>` per riga (6 su fileTable, 8 su actTable, regola §10.15), disciplina
  giusta riga per riga e «—» sulla mappa senza classe, sezioni a 1240px senza barra orizzontale,
  campo discipline nel modale classi (spunta → salva → `disciplinesOf` aggiornato), i 4 casi di
  `ensureGenerationContext` (1 disciplina = nessun modale · 2 = modale · Annulla e ✕ = `null`),
  cambio classe nel modale che ricarica le discipline, chip header «1B · Storia». Zero errori console.
- ⚠️ **Da testare in Electron vivo**: generazione reale con classe a 2 discipline → cartella
  `Mappe/<classe>/<disciplina>/` creata davvero; riapertura del vault annidato a 3 livelli;
  «Riordina cartelle» (backfill) sui progetti vecchi; pipeline «Genera materiali» che scrive nella
  cartella disciplina.
- 📌 **`Attività di studio/<Classe>/` NON prende il livello disciplina — per scelta.** Una sessione
  nasce sempre da una mappa e la mappa porta la sua disciplina: la colonna DISCIPLINA della tabella
  attività si popola per derivazione (`discOfMap`). Duplicare il dato nel nome di cartella creerebbe
  due fonti che divergono appena una mappa viene riassegnata. Restano note le limitazioni
  preesistenti di `open-vault-folder`/`zip-vault-to-materials`, che risolvono il vault per basename
  e non vedono i vault annidati.

### ✅ FATTO (29/7/26): assegnazione a posteriori di classe e disciplina (ELABORA)
Seguito della voce sopra. Le mappe generate senza contesto (o prima della feature) si sistemano
dalla tabella «Progetti esistenti» di ELABORA. **Solo ELABORA**: INSEGNA resta col trattino inerte.
- **Badge** (`missingBadge` in `mappai-landing-teach.js`): **rosso «MATERIA?»** (`alert-circle`) in
  cella DISCIPLINA quando manca la disciplina · **grigio «GENERICO»** (`circle-dashed`) in cella
  CLASSE quando manca la classe. Sono `<button>` con `event.stopPropagation()` (la riga sotto apre
  la mappa); entrambi aprono lo stesso modale.
- **Modale** `_openAssignModal` (classi `.pm-*` + Lucide, ESC/velo/Annulla chiudono): tendina classe
  (+ «nessuna classe») e tendina disciplina **dipendente** dalla classe scelta e **disabilitata**
  senza classe (senza classe non esiste cartella-disciplina). Una disciplina già assegnata ma non
  più in elenco resta selezionabile: aprire il modale per sbaglio non la cancella.
- **L'assegnazione SPOSTA la cartella** — nuovo IPC **`vault-relocate`** (main.js + preload):
  valida sotto `Mappe`, ricostruisce il path con `FilesCore.mapVaultParents`, collisione → « · 0N »,
  `renameSync` con fallback copia su `EXDEV`, e **rimuove i contenitori rimasti vuoti** risalendo
  fino a `Mappe`. Idempotente se il vault è già al posto giusto.
  ⚠️ Perché lo spostamento e non solo un campo: il resto della UI legge la CARTELLA come fonte di
  verità (`vaultChips`/`vaultDisc`), quindi un `p.disc` che la contraddicesse tornerebbe a mostrare
  il badge al render successivo. Verificato: con lo stub che ignorava lo spostamento i badge
  restavano — non un difetto del codice, la prova che la cartella comanda.
- Dopo lo spostamento riallinea `cls`/`clsId`/`classDir`/`disc`/`discDir`/`vault` sul progetto e,
  se la mappa è quella APERTA, anche `appState.activeVaultPath` (senza, il primo autosave
  riscriverebbe il vecchio percorso). Senza Electron (browser) aggiorna i soli metadati.
- ✅ Verificato in browser con IPC finto: badge giusti per riga (rosso/grigio/nessuno), argomenti di
  `vaultRelocate` corretti nei due casi (mappa in classe senza materia · mappa senza nulla →
  classe + materia), tendina disciplina disabilitata senza classe e ricaricata al cambio classe,
  metadati riscritti, badge spariti quando il disco rispecchia lo spostamento, INSEGNA con zero
  badge. Zero errori console. Suite **890/890**.
- ⚠️ **Da testare in Electron vivo**: spostamento reale della cartella (compresi i materiali dentro
  il vault), pulizia del contenitore di classe rimasto vuoto, collisione di nome nella destinazione,
  riassegnazione della mappa APERTA seguita da un autosave.

### 🔵 IN CORSO (28/7-4/8/26): 013-misuratore — app di misura separata + documento «basi scientifiche»
> ⚠️ **Dal 12/8/26 il misuratore è un REPO A SÉ**: `~/Claude/MappAI - misuratore` (cartella
> sorella, col suo git, il suo handoff e lo spec-kit trasferito). I percorsi qui sotto
> descrivono il layout vecchio — questa sezione resta come diario.
**Nulla committato**. Punto di ripresa completo in
`~/Claude/MappAI - misuratore/HANDOFF.md`; spec-kit in `specs/013-misuratore/` (là)
(spec 62 requisiti · plan · research · data-model · contracts · quickstart · 120 task).
**61 task su 120 · suite 118 (115 pass / 3 skip) ✅** (`cd "MappAI - misuratore" && npm test`).
**4/8: fasi 3+4 CHIUSE = MVP.** I tre bottoni della landing caricano davvero (vault, PDF,
classe intera), elementi e report persistono su disco, «Avvia analisi» produce il report
editoriale (struttura, parole/nodo, scala Gulpease, coppie stesso-concetto, matrice a 3-6,
distribuzioni a 7+, limiti dal profilo) e lo apre nell'app. Review avversaria via workflow
(44 agenti): **36 finding confermati, tutti corretti**. Provato VIVO in Electron via CDP sul
vault reale 1B. ⚠️ Il vault 1A non esiste più su disco → i suoi test di riferimento si
saltano (skip per-classe); 1B riproduce ancora l'assessment 2026 al percorso nuovo con la
disciplina. Prossimo blocco: fase 5 (US8, indice composito + tab METODO).

**Che cos'è.** Applicazione Electron **separata** che misura l'accessibilità del materiale generato da
MappAI. La separazione è voluta: chi misura non deve essere chi produce. Non importa nulla da MappAI a
runtime — le porzioni riusate sono **copiate** in `public/js/riuso/` con origine, commit e data
(`RIUSO.md`), e `tests/riuso-divergenza.test.js` confronta i verbi di `EDGE_FAMILIES` con l'originale
fallendo con l'istruzione di cosa aggiornare (si **salta** se MappAI non è raggiungibile).

**Il risultato che regge tutto.** `tests/riferimento-2026.test.js` è verde: sui vault reali `1A` e `1B`
riproduce **30 valori** dell'assessment del 24/07/2026. Tre definizioni sono **calibrate** (research.md R1)
e non si toccano senza rifare la calibrazione: (a) corpo del nodo = dopo il frontmatter **meno la riga del
titolo markdown**; (b) tokenizzatore `/[A-Za-zÀ-ÿ0-9']+/g` — apostrofo DENTRO la parola, trattino SEPARA;
(c) deviazione standard **di popolazione** (÷n). ⚠️ Nominalizzazioni, connettivi, passive e il corpus
sintesi **non** sono riproducibili: le liste del 2026 non furono scritte da nessuna parte (scarto 3,5× sui
subordinanti, 4× sui causali). Da qui la regola: ogni soglia porta definizione, motivo e limite.

**Vincoli architetturali già decisi.** `buildBaseline` **lancia** se riceve un Δ accessibilità senza la
copertura della fonte (nessuna via di codice produce l'uno senza l'altra); il profilo di parametri è
promosso prima di US3/US4 perché un'analisi senza profilo incorporato nasce rotta; deroghe consapevoli alla
costituzione su provider (solo Google: all'AI arrivano numeri aggregati, mai testi di allievi) e lingua
(solo italiano, stringhe comunque in `i18n/it.js`).

**Prossimo blocco**: fase 3 (14 task) — import dei vault e archivio dei report, che rende cliccabili i tre
bottoni della landing. Poi fase 4, costruttore del report editoriale, che chiude l'MVP.

**Documento pubblico** `pitch/basi-scientifiche.html` (~110 KB, autoconsistente, tab BASI SCIENTIFICHE):
14 sezioni, 35 riferimenti in linea, 23 voci di bibliografia, tutte le àncore valide. Fonti verificate una
per una; **«EFM-KG 2025» rimossa perché inesistente**, con nota che lo dichiara. Perno: Schroeder 2018
(costruire g = 0,72 vs studiare g = 0,43) → MappAI non consegna mappe da studiare, produce l'impalcatura
per costruirle.

### 🎨 REGOLA NUOVA (29/7/26): stile delle pagine-documento (≠ token della landing, §10.16)
Fissata da Giacomo correggendo `basi-scientifiche.html`. Vale per ogni pagina-documento futura.
- **Colonna unica centrata**: titoli, prosa, riquadri e schede condividono larghezza e asse. Le tabelle
  sono l'unica deroga e si allargano, restando centrate.
- **Schede**: fondo pieno d'accento + testo bianco; hover fondo giallo + testo slate-800. **Niente testo
  grigio di corollario** sotto il dato e **niente riga d'invito** («Apri la fonte →»): il colore pieno
  annuncia da sé che la scheda è cliccabile. Chip a fondo bianco e testo blu per le voci brevi.
- **Approfondimenti**: le schede con un dato sono `<button>` veri e aprono un modale con testo **≤700
  caratteri** (titoletti + grassetti) e in fondo la citazione cliccabile verso la bibliografia. ESC, clic
  sul velo e crocetta chiudono; il fuoco torna alla scheda e resta prigioniero nel modale.
- **Tipografia**: corpo 19px desktop, titoli ben sopra il corpo, `hyphens:auto` sulla prosa e
  `text-wrap:balance` sui titoli. Il testo delle schede eredita il corpo della prosa.
- **Contrasto ≥ 4,5:1 sempre, misurato.** ⚠️ I toni chiari della palette col bianco NON reggono:
  `--emerald` 2,5:1 · `--orange` 2,4:1 · `--blue` 3,6:1. Usare `#047857`, `#c2410c`, `#2563eb` (~5:1).
  Mai bianco trasparente per fare gerarchia: all'85% scende sotto soglia.
- **Numeri**: virgola decimale e punto per le migliaia, con `toLocaleString('it-IT',{useGrouping:true})` —
  in modalità automatica i numeri di 4 cifre restano senza punto.
- **Un grafico deve misurare qualcosa**: barre solo dove proporzionali a una scala dichiarata.

### ⚠️ TRAPPOLE DI VERIFICA (29/7/26) — due errori commessi, da non ripetere
1. **`clamp()` senza spazi attorno all'operatore è un errore di sintassi scartato in silenzio.**
   `clamp(19px,0.8vw+17px,22.5px)` ✗ · `clamp(19px, 0.8vw + 17px, 22.5px)` ✓. Sei regole ne erano affette:
   gli elementi mostravano la dimensione della **cascata** (h3 a 22,23px = 1,17 × corpo, il default del
   browser), abbastanza verosimile da non insospettire. `getComputedStyle` dice quale valore è in vigore,
   **non da dove viene**: prima di riportare l'effetto di una regola appena scritta, verificare che sia
   quella che vince.
2. **Il pannello browser lavora con `visibilityState: hidden`** → `requestAnimationFrame` sospeso (zero
   fotogrammi in 600ms, misurato). Schermate bianche o stantie, contatori animati fermi a zero: **non è un
   difetto della pagina**. Verificare interrogando il DOM e dichiarare esplicitamente che la verifica
   visiva d'insieme non è stata fatta.

### ✅ FATTO (28/7/26): editor documenti — tipi di blocco, dimensione dell'anteprima, etichette ferme; strumenti a11y per contesto
Sessione di rifinitura sull'editor documenti di ELABORA + gating degli strumenti compensativi.
Suite **809 pass / 0 fail** (804 + 5 nuovi). Tutto verificato con misure nel browser su un
harness che carica i moduli VERI (mai stime a occhio); niente di questo è provato in Electron.

**(1) Mockup comparativi degli editor (fuori dal repo).** 4 editor × 3 pannelli larghi DAVVERO
900/1920/2560 px, generati dall'HTML+CSS veri di `mappai-doc-editor.js` (harness con stub
minimi + cattura), con interruttore prima/dopo e misure scritte nel file. Materiale usa-e-getta
nello scratchpad di sessione. La skill globale `~/.claude/skills/mockup-layout` è stata estesa
con questa seconda ricetta (schermate dell'app alle larghezze vere), un passo di DOMANDE
iniziali e i modelli riusabili in `assets/`.
- **Proposta di scala tipografica NON applicata al codice**: a 900px 12/13/14 px con crescita
  continua (+25% a 2560) via `clamp()` + `cqi`. Vive solo nel mockup, in attesa di decisione.
  Se la si adotta: la sintesi è un caso a parte (lì lo zoom del foglio vale già ×1.85 a 1920 e
  ×2.4 a 2300 — sostituirlo con +25% RIMPICCIOLIREBBE il testo di oggi).

**(2) Colonna delle etichette dei blocchi (sintesi)** — [mappai-doc-editor.js](public/js/mappai-doc-editor.js):
- `flex:0 0 15ch` + `white-space:nowrap` + `text-align:right` + `margin-left:-10px`. In **px** la
  colonna andava a capo appena il corpo cresceva («SOTTOTITOLO» è la più lunga); in CARATTERI
  regge qualunque dimensione. Misurato: un solo bordo di allineamento a 900/1920/2560.
- **Le etichette non seguono lo zoom del foglio**: `--de-zsum` = zoom automatico × zoom utente,
  `font-size: calc(9px / var(--de-zsum))` → 9px a schermo SEMPRE, e la colonna con loro (83px).
  Prima a ×2.4 diventavano titoli. È il criterio che già aveva l'etichetta «GENERATO».
- **`align-items:baseline` sulla riga** (`.de-block`): la targhetta si allinea da sola alla prima
  riga del blocco. Prima il margine superiore dei titoli stava sul TESTO e spingeva giù solo la
  colonna di destra → TITOLO 14px più in alto del suo testo, SOTTOTITOLO 9px. La variante con
  quattro scostamenti a mano (uno per tipo di blocco) è stata scartata: andava ricalibrata a
  ogni ritocco tipografico. Misurato: scarto 0.0 su h3/h4/p/li/blockquote/raw a ogni zoom.
  ⚠️ Per verificarlo serve la baseline VERA (sonda `<span style="display:inline-block;width:0;
  height:0;vertical-align:baseline">`): il `rect.bottom` di un Range include il discendente e dà
  scarti finti.

**(3) Tipo di blocco cambiabile (sintesi).** Prima il «+» aggiungeva SEMPRE E SOLO un paragrafo e
il tipo non si poteva cambiare: `blockquote` («Nota») esisteva nel modello, nel lettore TTS e
nella stampa, ma dall'editor era irraggiungibile.
- Core puro: `MappAIDocEdit.setBlockTag(blocks, i, tag)` — immutabile, tiene il testo, **rifiuta
  i blocchi `raw`** (convertirli li darebbe in pasto al lettore ad alta voce, che deve saltarli).
- UI: l'ETICHETTA è il selettore (clic → menu dei 5 tipi con sottotitolo); il «+» apre lo stesso
  menu per il blocco nuovo. Stato `_bMenu` (i = cambia il tipo di i, −100−i = aggiungi sotto i).
- Le citazioni «GENERATO» restano in sola lettura (scelta utente).

**(4) Dimensione dell'anteprima** (richiesta utente): barra dell'editor `− 100% +`, la percentuale
riporta a 100.
- Core: `ZOOM_STEPS` `[0.85, 1, 1.15, 1.3, 1.5]` + `stepZoom`/`nearestZoom` (valori vecchi o
  sporchi → gradino più vicino).
- `--de-user` MOLTIPLICA lo zoom automatico, non lo sostituisce → chi non tocca niente vede
  quello di prima. Ricordato **per tipo di documento** (`mappai_doc_zoom_<kind>`): il foglio nodi
  si guarda da lontano, la sintesi da vicino.
- Guardia anti-sbordo: `max-width: min(var(--de-max), 100%)` — con lo zoom il 100% vale la
  larghezza del pannello diviso lo zoom, quindi il foglio si ferma al bordo per costruzione
  (a 150% in un pannello da 900: 846px invece di 1200). Verificato a ogni gradino.
- Non è una modifica al documento: niente undo, niente «da salvare». Il tooltip dice che la
  stampa non cambia (i builder del PDF non leggono il CSS dell'anteprima).

**(5) Strumenti compensativi solo dove si legge** — [mappai-a11y.js](public/js/mappai-a11y.js):
- Contesto di lettura = `map-view` attiva **e** nessun workspace ELABORA davanti (copre mappa,
  schede dei nodi, sidebar/Raccoglitore). Fuori: bottone `display:none !important` (l'inline
  normale perde contro `style.css`) e `tabindex="-1"`.
- **Gli effetti si SOSPENDONO e si RIPRISTINANO**: nascondere e basta lasciava chi aveva acceso
  «inverti colori» con lo schermo invertito e senza il bottone per spegnerlo. Classi su `<html>`,
  riga di lettura e zoom testo tornano com'erano al rientro.
- Due bug trovati provando: (a) `offsetParent !== null` non rileva `#elab-overlay` — per un
  elemento `position:fixed` è SEMPRE null → si usa `getComputedStyle(...).display`; (b) il
  `requestAnimationFrame` che accodava il ricalcolo non scatta a finestra in secondo piano: la
  richiesta restava appesa, il flag «già in coda» non si riabbassava e da lì in poi nessun cambio
  di vista veniva più visto → `setTimeout` + `visibilitychange`.
- Kill-switch `mappai_a11y_everywhere='1'` → comportamento storico.

**Test nuovi** (`tests/docedit-core.test.js`): `setBlockTag` (round-trip HTML, `raw` non
convertibile, indice fuori range), `stepZoom` (cima/fondo scala), `nearestZoom` (valori sporchi).

**Flag nuovi**: `mappai_doc_zoom_<kind>` (dimensione anteprima per tipo di documento) ·
`mappai_a11y_everywhere` (strumenti a11y ovunque, comportamento storico).

⚠️ **Da testare in Electron vivo**: menu dei tipi su una sintesi vera (compreso il round-trip
salva → riapri con un blocco convertito in NOTA) · zoom dell'anteprima sui 4 tipi di documento e
la sua memoria per tipo · bottone a11y che sparisce entrando in ELABORA e riappare tornando alla
mappa, con gli effetti ripristinati · stampa invariata dopo aver toccato lo zoom.

🐛 **Difetto PREESISTENTE trovato misurando** (non introdotto qui, non ancora corretto): nel
foglio dei nodi 7 titoli di card vengono tagliati di ~3px dall'ultima riga (`overflow:hidden` su
`.de-ns-inner`). Verificato col CSS attuale e Space Mono caricato, identico a 900/1920/2560.

### ✅ FATTO (27/7/26): editor del FOGLIO DEI NODI in ELABORA → Documenti (contenuto per-card)
Richiesta utente: il foglio nodi diventa un documento editabile, con il tipo di contenuto
scelto CARD PER CARD (solo titolo · titolo + spazio da scrivere · titolo + parole chiave ·
titolo + descrizione), la possibilità di aggiungere a mano i campi che l'AI non ha generato,
il titolo che sale in alto appena la card riceve un contenuto, e il badge ambra sul testo
troppo lungo. Suite **803** (801 pass, 2 skip preesistenti, +27 nuovi test).
- **Core puro** `public/js/mappai-nodesheet-core.js` (UMD, `window.MappAINodeSheet`,
  +27 test `tests/nodesheet-core.test.js`): geometria del foglio (A4 orizzontale, margini
  10/15, griglia per formato, corpi in pt) — **ora è l'unica fonte**, `printAllNodeLabels`
  la legge (fallback ai numeri storici se il core manca); `charLimits(fmt, layout, titolo)`
  = soglie di caratteri ricavate dalla geometria (titolo · parola chiave · quante parole
  chiave entrano sotto QUEL titolo · descrizione); modello card `{id,label,layout,keywords,
  desc}` con operazioni immutabili; `syncCards` (riallineamento ai nodi: i nuovi in coda, gli
  spariti fuori, i testi rivisti **mai riscritti**, `exclude` per le card tolte a mano);
  `toPrintCards` (azzera i campi che il tipo non usa e scarta le righe vuote); `validateDoc`.
  ⚠️ Le parole chiave VUOTE restano nel modello (è la riga appena aggiunta che si sta
  scrivendo): spariscono solo alla stampa — filtrarle nel core le faceva sparire sotto le dita.
- **Motore di stampa** (`printAllNodeLabels`): nuova opzione `opts.cards` — quando c'è,
  ogni card porta il proprio `layout`/`label`/`keywords`/`desc` e sostituisce depth+layout
  globali e la generazione AI delle parole chiave. Loop unificato su `entries` (foglio
  rivisto **o** nodi+layout unico → stesso codice di disegno). Nome file/archivio distinti
  (`Foglio-nodi-rivisto.pdf`, titolo « (rivisto)») per non sovrascrivere l'automatico.
  Percorso storico (modale + pipeline materiali) **invariato**.
- **Editor** (`mappai-doc-editor.js`, kind `'nodesheet'`): gruppo «Foglio dei nodi»
  nell'elenco documenti (c'è sempre: il foglio si costruisce dalla mappa, non serve averlo
  generato prima); card disegnate con le **proporzioni vere** della carta (`aspect-ratio`
  dalla geometria sul CORPO della card, non sulla cornice) e corpi del testo in scala
  (px/mm calcolati dal foglio a 800px); bottone **«+»** per-card → menu dei 3 contenuti
  (+ «solo titolo» per togliere), con prefill da quello che la mappa già sa (figli del nodo
  → parole chiave via `_fallbackKeywords`, desc del nodo → testo scheda) e campi vuoti da
  riempire a mano quando la mappa non ha nulla; barra formato (3×4/2×2/2×1) · profondità ·
  quadretti · «a tutte le card» · **«Parole chiave con AI»** (riempie SOLO le card vuote,
  stesso motore `_generateNodeKeywords` del foglio automatico); badge contatore per card,
  **ambra** quando il testo non entra (bordo card + badge), con la regola scritta in cima;
  togli/ripristina card (il nodo resta nella mappa); Annulla (undo), Salva, Stampa (avvisa
  sulle card fuori soglia), Nel vault (PDF headless in `Materiale Studio/`).
- **Persistenza**: `appState.db.nodeSheet` (dentro il progetto, salvato da
  `saveCurrentProject`); alla riapertura si riallinea alla mappa e lo dice.
- i18n: chiavi `de_ns_*`/`ns_*` in `en_translations.js`, fallback IT inline (regola 13);
  audit: 0 mancanti. Il modale storico del foglio nodi rimanda all'editor.
- ✅ Verificato in browser (server statico + pagina reale con licensing nascosto lato-DOM):
  proporzioni card = 1.539 (= 138,5/90 mm) e 2.052 in 3×4, titolo centrato → in alto al
  primo contenuto, prefill figli/desc, parola chiave scritta a mano, badge ambra su desc
  lunga, 3×4 che riporta tutto a «solo titolo» avvisando, togli/ripristina, round-trip
  salva → riapri (layout + keyword + desc conservati), PDF headless (2 pagine per 5 card
  2×2, 1 per 6 card 3×4, nessun crash con card orfana), percorso legacy invariato,
  zero errori console.
- ⚠️ **Da testare in Electron vivo**: «Parole chiave con AI» con chiave vera, «Nel vault»
  (IPC `html-to-pdf` non serve qui: il PDF esce da jsPDF, ma serve `save-vault-file`),
  stampa reale su carta dei 3 formati, foglio rivisto visibile in INSEGNA → Materiali.

### ✅ FATTO (23/7/26): ELABORA hub documenti — editor quiz/sintesi, foglio flashcard, «Quiz cartacei» in INSEGNA
Richiesta utente: la pagina ELABORA diventa hub di elaborazione anche per i DOCUMENTI DI
OUTPUT. **Principio non negoziabile**: si edita la SORGENTE (item degli studySets, blocchi
della sintesi), mai l'HTML stampato — i builder di stampa restano l'unica resa, così
schermo · stampa · PDF · QR · vault non divergono. Suite **740/740** ✅ (+34 nuovi test,
2 skip preesistenti).
- **Core puro** `public/js/mappai-docedit-core.js` (UMD, `window.MappAIDocEdit`, +34 test
  `tests/docedit-core.test.js`): normalizzazione item (le tre forme storiche `q/correct`,
  `front/back`, `question/correctIndex` diventano una sola — **idempotente**), `docFromSet`/
  `applyToSet` (round-trip che preserva id e campi non gestiti), operazioni di lista
  immutabili, `validateDoc`, `sanitizeInline` (whitelist `b/i/u/sup/br/span[color]` +
  `<font color>` di execCommand → span; **nessun controllo di dimensione**: la taglia
  dipende dal tag di blocco), modello a BLOCCHI della sintesi (`blocksFromHtml`/
  `blocksToHtml`, con blocchi **`raw`** per i `<div>` generati), `audioStale`,
  `createHistory` (undo cap 20), slot colore, `FLASH_FMT` + `backsideOrder`.
- **Editor UI** `public/js/mappai-doc-editor.js` (`window.MappAIDocEditor`): lista documenti
  (quiz · flashcard · sintesi in memoria e in archivio) e due editor **identici al foglio di
  stampa** (stesse misure/colori/gerarchia di `buildQuizSetHtml` e `_buildSynthesisPrintHtml`):
  quiz/flashcard con campi contenteditable, aggiungi/elimina/sposta domanda e opzione, click
  sulla lettera = risposta corretta; sintesi a blocchi con barra stile (B/I/U + color picker
  RGB + 5 slot persistiti in `mappai_doc_colors` + **pipetta** via EyeDropper API). Salva ·
  Annulla (undo del documento) · Stampa · Nel vault · HTML (solo sintesi).
- **ELABORA**: nuova **modalità** `_mode` `'source'|'docs'` (segmento «Fonte / Documenti»
  accanto al titolo, `MappAIElabora.setMode`); in `docs` la barra mostra solo le azioni
  dell'editor e il corpo è `#elab-doc-host`. Uscire con modifiche pendenti chiede conferma.
- **Riuso dei builder**: `buildQuizSetHtml(set, {includeAnswers, includeBar, mapName})` +
  namespace `window.MappAIQuizPrint` (STYLES, toPrintItems, setFromHtml). **Bug risolto**:
  i set in forma `q/correct` (generateDynamicQuiz) stampavano domande VUOTE e soluzione «—»
  dalla sidebar — ora i builder normalizzano. Il foglio incorpora la sorgente in
  `<script type="application/json" id="qp-set">` → si ristampa con/senza soluzioni senza
  riaprire la mappa.
- **Foglio flashcard** `window.printFlashcardSheet({items, fmt, backside, bg, toDisk})` in
  print-dossier: A4 **landscape**, geometria IDENTICA ai fogli nodi (margini 10/15, card
  138.5×90 mm a 2×2, tratteggio arancio di taglio), formati **2×1 · 2×2 · 4×3**, testo
  auto-rimpicciolito per stare nella card; default «piega» (domanda sopra / risposta sotto),
  opzione **fronte-retro** con retro **specchiato per riga** (stampa sul lato lungo).
- **Sintesi**: `_buildSynthesisPrintHtml` accetta `data.editedBlocks`; `MappAIBranchSynthesis`
  espone `getData/setData/bodyHtml`. **Il TTS regge** perché i blocchi editati mantengono
  tag e ordine (h3/h4/p/li) che il lettore si aspetta; l'audio con voce naturale viene
  **invalidato** quando cambia il testo letto (`audioStale`) e l'editor lo segnala.
  ⚠️ Nella sintesi «tutta la mappa» le citazioni vivono DENTRO il corpo, sezione per sezione:
  sono conservate come blocchi `raw` e NON vengono riappese in coda (evita duplicati e il
  crash su `sourcesArr` inesistente).
- **INSEGNA → «Quiz cartacei»**: sezione nuova (archivio `quizpaper`/`flashsheet` +
  file `Quiz-*`/`Flashcard-*` su disco della mappa selezionata) con **stampa via modale
  con/senza soluzioni** e **condivisione QR** (agli allievi va sempre la copia senza
  soluzioni). `DOC_KINDS` esteso; i cartacei non compaiono più tra i Materiali.
- **Timeline**: cornice (header card, badge, footer) allineata al foglio quiz/sintesi.
- i18n: chiavi `de_*`/`el_mode_*`/`fc_*`/`lt_qp_*`/`ui_teach_quizpaper` in
  `en_translations.js`, fallback IT inline (regola 13). Audit: 0 mancanti.
- ✅ Verificato in browser (server statico, licensing bypassato solo lato-DOM): lista
  documenti, editor quiz (edit → undo → salva → studySets in forma storage, `angle`
  preservato), archivio + round-trip `setFromHtml` con virgolette/tag nel testo, varianti
  con/senza soluzioni, editor sintesi (blocchi, `<sup>` preservati, colore applicato),
  sintesi «tutta la mappa» (citazioni per sezione conservate, 6 blocchi leggibili dal TTS),
  4 formati di foglio flashcard + geometria verificata numericamente con un jsPDF finto,
  guardie (conferma all'uscita, Ctrl+Z che NON tocca il grafo), sezione INSEGNA e i due
  modali. Zero errori console.
- **Round 2 — review avversaria (5 lenti + verificatori che provano a confutare)**: 41 reperti,
  **29 confermati e tutti chiusi**. I sostanziali:
  1. **Listener duplicati**: `_bind` riagganciava i 6 handler a ogni render sullo STESSO
     `#elab-doc-host` (che `innerHTML` non distrugge) → un incolla inseriva il testo N volte
     e Ctrl+Z annullava N operazioni. Fix: guardia `host._deBound` (il picker colore, che è
     un figlio rigenerato, resta fuori dalla guardia).
  2. **Quiz per nodo/ramo persi**: quelli generati da `mappai-flashcards-sr.js` usano
     `{q, a1, a2, a3, correct: <numero>}` → il core mostrava zero opzioni e come risposta un
     NUMERO. Fix: `_optsFromAn` + `shapeOfItems`/`doc.shape`; `applyToSet` ricostruisce
     `a1/a2/a3` con `correct` 1-based → il player in-app continua a funzionare (+4 test).
  3. **Invio nei blocchi di sintesi** incollava le parole (il `<div>` del browser veniva
     scartato): ora `insertLineBreak` + normalizzazione dei `<br>` fantasma nel core.
  4. **Salvataggio nel progetto sbagliato**: cambiando mappa in ELABORA l'editor restava
     aperto sul documento della precedente. Fix: `_mapKey` (id progetto + titolo) verificato
     al salvataggio, editor azzerato in `openProject`, conferma se il set è sparito.
  5. **Doppione in archivio** della sintesi (chiave di dedup diversa dall'auto-salvataggio):
     ora passa da `MappAIBranchSynthesis.archiveDoc` (stessa chiave) e le voci riaperte
     dall'archivio si aggiornano per id.
  6. **`sanitizeInline`**: la chiusura di uno `<span>`/`<font>` scartato chiudeva lo span
     COLORATO che lo conteneva (il colore si troncava a metà frase).
  7. Foglio flashcard archiviato come `flashsheet` (era `quizpaper` → etichetta «Quiz» e QR
     attivo per errore); tipo nel titolo per evitare collisioni MC/VF dello stesso ramo;
     `Sintesi.html` del vault non più sovrascritta (nome per ramo + « (rivista)»); i file
     `Quiz-*`/`Flashcard-*` su disco non compaiono più in due sezioni; `deleteDoc` ridisegna
     anche «Quiz cartacei»; salvataggio rifiutato se la sintesi resta senza testo.
  8. A11y: risposta corretta segnalata anche da un ✓ e da `aria-checked` (non solo dal
     colore), `aria-label` su tutti i campi editabili, strumenti di riga visibili anche da
     tastiera (`:focus-within`), contrasto dei testi grigi portato a ≥4.5:1, ESC + gestione
     del focus nei due modali nuovi.
- ⚠️ **Da testare in Electron vivo**: «Nel vault» (IPC `html-to-pdf` + `save-vault-file` →
  il PDF compare in `Materiale Studio/` e nella sezione Quiz cartacei), condivisione QR da
  telefono, pipetta EyeDropper, stampa reale su carta dei 3 formati flashcard (fronte-retro
  sul lato lungo), sintesi con voce naturale già generata → messaggio di audio da rigenerare.

### 🔵 IN CORSO (21/7/26): branch `fix/deepening-residuo` — P1+P2 anti-parafrasi nel deepening
Branch NON ancora mergiato. Origine: audit pedagogico su mm_elvezia + mm_la_carta
(vedi memoria `audit-deepening-dnodes.md`) → i nodi `_D<n>` (Fase 3.7 "deepening
selettivo") erano il 38.8% / 42.7% delle due mappe, ~metà parafrasi del padre.
Causa: il pass si attivava sulla PROFONDITÀ mancante e riceveva come materiale la
SOLA desc del padre (`textParts`, la fonte vera, era passato ma MAI usato). Fix in
due mosse, entrambe in `executeDeepeningPass` (mappai-generation-support.js:1734+):
- **Core puro** `public/js/mappai-deepen-core.js` (UMD, dipende soft da
  `MappAIDescFidelity` per tokenizzazione/stemming IT; caricato in index.html DOPO
  desc-fidelity, PRIMA di generation-support). API: `residueSentences`/
  `buildResidueMaterial` (P1: frasi della fonte on-topic col padre MA con lessico
  nuovo), `paraphraseVerdict`/`filterProposedChildren` (P2: scarta un sotto-concetto
  se il suo lessico è ≥`maxContainment`=0.60 già nel "coperto" = desc padre +
  fratelli accettati, o porta <3 parole nuove; il covered CUMULATIVO uccide i
  fratelli quasi-identici). +12 test `tests/deepen-core.test.js`.
- **P1 nel pass**: materiale = residuo dalla fonte (`textParts` ora USATO), gate =
  presenza di residuo (non più profondità del ramo; lo slider resta TETTO di
  profondità). Nessun residuo → niente approfondimento. Prompt riscritto: mostra al
  modello "GIÀ COPERTO (non ripetere)" vs "NUOVO MATERIALE DALLA FONTE".
- **P2 nel pass**: `filterProposedChildren` prima dell'inserimento; log
  `+N nodi, M scartati (parafrasi)`. +3 test `tests/deepening-integration.test.js`
  (mock fetchModelAPI: 1 valido + 2 parafrasi → 1 inserito).
- **Reversibile**: kill-switch generale `mappai_deepening_enabled` (esistente);
  A/B col comportamento legacy (materiale=desc, no verdetto) via
  `mappai_deepen_residue='false'`. Se il core manca o la fonte è <200 char → legacy
  o skip (mai parafrasi in un vault riaperto senza fonte).
- **Verifica sui dati reali** (harness Node, P2 vs padre col covered cumulativo):
  Elvezia 16/33 D-nodes scartati (48%), Carta 24/35 (69%) — coerente con l'audit.
  Suite **636/636** ✅ (621 + 12 + 3).
- ⚠️ **Da testare in Electron vivo**: generazione MM multi-pass reale su una fonte →
  contare i D-node risultanti (attesi molti meno) e verificare che siano dettagli
  nuovi, non parafrasi; log `[Deepening]` in console; A/B col flag legacy.
- **Round 2 (21/7/26, commit `18a8a56`) — P1-bis + P3 dopo la prima generazione reale.**
  La mappa "Storia della Carta" (2A) ha mostrato il modo di fallimento successivo:
  retrieval per-foglia indipendente → stessa frase della fonte depositata come figlio
  in 4 rami diversi, anche sotto padri fuori tema ("Produzione Papiro" riceveva i
  magli idraulici di Fabriano — lessico di superficie condiviso). Fix, tutto
  deterministico in `mappai-deepen-core.js` + wiring nel pass:
  - **P1-bis `assignResidues`**: assegnazione GLOBALE frase→foglia (argmax pertinenza).
    Competono TUTTI i nodi; i non-approfondibili sono ASSORBITORI: uccidono la frase
    solo se davvero coperta (novità <3) o reclamata con pertinenza ≥`absorberClaimMin`
    0.5; vittoria "di superficie" → ripiego sulla miglior foglia eligible (senza,
    i padri a desc ricca mangiano il recall — finding review). A parità eligible >
    assorbitore.
  - **P2 esteso**: coperto = catena antenati fino al L1 (prima solo padre); cresce solo
    coi fratelli DAVVERO inseriti.
  - **P3 `isNearDuplicate`**: gate globale all'inserimento — candidato vs TUTTI i nodi
    (Jaccard ≥0.55 o containment ≥0.75), antenati esclusi (già governati da P2).
  - Review avversaria via workflow (2 verificatori con probe): 1 major + 3 minor,
    tutti fixati. Suite **646/646** (+8 test, incl. regressione realistica del bug
    "martello di legno" papiro↔magli e coppia reale D5/D7).
- Limite noto residuo: metro LESSICALE → i quasi-duplicati con lessico davvero
  disgiunto (sinonimi puri) restano per l'eventuale variante embedding (riuso
  `executeSemanticDedup` senza skip stesso-L1). Aperte P4-P7 dell'audit.
- ⚠️ Perf nota (review): `assignResidues` sincrona ~560ms su corpus 60K parole ×
  100 nodi (dietro overlay, ok); cresce lineare — se corpus/nodi raddoppiano
  valutare yield periodici.

### 🔵 IN CORSO (21/7/26): tetto di profondità reale — lo slider «Genera fino a» ora vincola i DATI
Branch `fix/deepening-residuo`, NON committato con questo commit di doc. Origine: le mappe
chieste «fino a L3» uscivano con nodi L4/L5. Diagnosi (3 difetti sovrapposti):
1. **Prompt Fase 3 contraddittorio** — scriveva sempre `(L2, L3, L4, L5)` ignorando
   `maxMapLevel` ([mm-extraction.js:819](public/js/mappai-mm-extraction.js:819) +
   [generation-support.js:496](public/js/mappai-generation-support.js:496)) → il modello
   seguiva l'elenco concreto, non il numero.
2. **Zero clamp nei dati** — il tree-sanitizer etichetta la profondità topologica reale,
   nessuno pota oltre il tetto.
3. **Lo slider #level-slider è solo FILTRO VISTA** (`onLevelSliderInput`→`applyVisualFilters`,
   [d3-render.js:1810](public/js/mappai-d3-render.js:1810)): nasconde i nodi profondi sul
   canvas ma NON li elimina → una mappa «L3» era una L5 con L4/L5 **vivi nel vault** (quindi
   in quiz, fogli nodi, materiali). `mm_dal_papiro.json` ha davvero `level:4/5`.

**Decisioni utente**: (a) il dettaglio L4/L5 si **RIPIEGA nella desc** dell'antenato-al-tetto
(niente info persa, desc più ricche — ideale BES/DSA); (b) **due controlli separati**
«Genera fino a» (dati) + «Mostra fino a» (vista).

**Implementato** (tutto deterministico, zero AI):
- **`MappAIDeepenCore.foldBeyondDepth(nodes, links, maxLevel)`** (core puro): profondità
  TOPOLOGICA (BFS da ROOT, non il campo `level`); ogni nodo oltre il tetto rimosso e la sua
  desc **travasata** nella desc del cap (antenato a profondità = maxLevel), ma solo le frasi
  con lessico nuovo (riuso `isNearDuplicate` anti-bloat) e finché la desc resta < 140 parole;
  cross-link da nodi ripiegati ri-puntati al cap (self-loop/dup scartati). +5 test incl.
  fixture reale.
- **Prompt dinamici**: lista livelli e id-esempio generati da `maxMapLevel` (a 3 → «L2, L3»),
  + regola «NON superare MAI il Livello N: riassumi il dettaglio più fine nella desc».
- **`window.applyDepthCeiling(maxMapLevel)`** (generation-support.js): applica il fold su
  `appState.db`, pulisce sourcesDict/customColors dei nodi ripiegati. Chiamato dopo
  deepening+sanitize in **multipass E iterativa**, poi ri-sanitizza. Kill-switch
  `mappai_depth_ceiling='0'`. Solo MM (no KG).
- **`window.getGenDepth()`/`setGenDepth(v)`**: profondità di GENERAZIONE separata dallo
  slider vista (`localStorage mappai_gen_depth`, fallback slider→5). `mm-extraction.js:785`
  ora legge `getGenDepth()`.
- **UI**: `#gen-depth-select` (L2 essenziale…L5 massimo) nel modale config AI accanto a
  «Lingua delle mappe» (init in `mappai-ui-modals.js`); slider toolbar rietichettato
  «Mostra fino a» con tooltip che chiarisce il ruolo. i18n `ui_show_depth`/`ui_gen_depth_label`
  in ENTRAMBI i dizionari.
- **Verificato in browser**: fold reale `mm_dal_papiro` a L3 = **70→47 nodi, 23 ripiegati,
  16 dettagli confluiti, 5 parafrasi saltate**; lista livelli «L2, L3» a tetto 3; global
  esposti; selettore presente. Suite **658/658** ✅.
- ⚠️ **Da testare in Electron vivo**: generazione reale a L3 (attesi zero nodi L4/L5 nel
  vault, log `[Tetto L3]` + `[Deepening]`); `applyDepthCeiling` usa `appState` (non
  esercitabile da browser statico).
- Flag nuovi: `mappai_depth_ceiling` (kill-switch tetto, default ON) · `mappai_gen_depth`
  (profondità di generazione, default = slider).

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
| `mappai_deepening_enabled` | Kill-switch generale della **Fase 3.7 deepening** (nodi `_D` di approfondimento). `'false'` = niente pass di approfondimento | ON |
| `mappai_deepen_residue` | Deepening in **modalità residuo+verdetto (P1+P2)**: materiale dalla fonte + scarto delle parafrasi. `'false'` = comportamento legacy (materiale = desc del padre, nessun verdetto anti-parafrasi) | ON |
| `mappai_doc_zoom_<kind>` | **Dimensione dell'anteprima** nell'editor documenti, per tipo (`quiz`/`flashcards`/`synthesis`/`nodesheet`). Gradini 0.85·1·1.15·1.3·1.5; moltiplica lo zoom automatico, non tocca la stampa | 1 |
| `mappai_active_discipline` | **Disciplina attiva** (contesto di generazione, 29/7). Scritta dal modale classe+disciplina; vale solo se coerente con la classe attiva (`effectiveDiscipline`). Governa la cartella `Mappe/<classe>/<disciplina>/` | vuoto |
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
