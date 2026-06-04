# CLAUDE.md — MappAI Swiss Edition
> Documento di briefing per Claude Code.
> Autore: Giacomo Meschini — giacomo@insegnai.ch
> Ultimo aggiornamento: 4 giugno 2026 (sessione — MM quality pipeline: JSONL 1A, Phase 4/5, BranchBoundaries, ambits L1)

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
│   │   ├── app.js       ← MONOLITE principale (~14.000+ righe)
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

## 7. MODELLI INFOMANIAK — VALUTAZIONE (aggiornato 4 giugno 2026)

### Raccomandazione per profilo
| Modello | Profilo ottimale | MM | KG | Note |
|---------|-----------------|----|----|------|
| **Gemma-4 31B** | 4a Media, BES/DSA, scienze | ✅ | ⚠️ | Baseline stabile. Label puliti. KG scarso con lenti (anomalia token). |
| **Mistral Small 119B** | Liceo, storia, doc lunghi | ⚠️ | ⚠️ | Profondità L5, 200K context. **JSON spesso malformato** (~30% loss JSONL). Variabilità alta tra run. |
| **Kimi-K2.6** | Corpus lunghi, alta qualità | 🔬 in test | 🔬 | 256K context. Bug responseSchema risolto (4/6/26). Test completo da fare. |
| **Apertus 70B** | Solo MM semplici | ⚠️ | ❌ | NO function calling. Nessun KG. |

### Problemi Mistral Small — stato attuale (4 giugno 2026)
- ✅ 4 regole anti-label aggiunte a `MIND_MAP_BRANCH_IT` (regole 11-14)
- ✅ `maxOutputTokens` 3000→8192 per ridurre troncamenti Fase 3
- ⚠️ **Problema strutturale irrisolto**: produce JSON con chiavi-spazio (`"id "`),
  double-escape (`{\"id\":\"X\"}`), oggetti spezzati su più righe. Il parser JSONL
  ora recupera parte di questi errori ma su rami profondi perde ~30% dei nodi.
- ⚠️ **Alta variabilità**: stesso documento, stessa config → crossRatio tra 8% e 21%
  a seconda del run. Non adatto per benchmark ripetibili.

### Anomalia da investigare: KG GEMMA + lenti → 37K token (atteso 65K)
Solo 13 nodi generati. Causa: `extractKnowledgeGraphSinglePass` con `focusTopic`
non vuoto potrebbe troncare il testo sorgente. Vedere TODO punto 10 backlog.

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

---

## 11. SESSIONE DI SVILUPPO CORRENTE — PRIORITÀ

### Completato in questa sessione (4 giugno 2026 — MM quality pipeline)
Vedi TODO.md §COMPLETATO per il dettaglio completo. Riassunto:
- ✅ `dev-console-metrics.js` — toolkit metriche auto-caricato, `MappAIMetrics.report()`
- ✅ Strategia 0: `MappAITruncationTracker` — rilevamento troncamenti in tempo reale
- ✅ Strategia 1A: JSONL sezionato per Infomaniak (parser + prompt + feature flag)
- ✅ Fix `maxOutputTokens` Mistral 3000→8192; fix Fase 1 Infomaniak senza responseSchema
- ✅ 4 regole `MIND_MAP_BRANCH_IT` (anti-date, anti-lista, anti-duplicato, pivotali-L2)
- ✅ Phase 4: merge semantici cross-ramo + cross-link (flag `mappai_mm_phase4_enabled`)
- ✅ Phase 5: riclassificazione L2/L3 mal collocati (flag `mappai_mm_phase5_enabled`)
- ✅ Branch Boundaries: catalogo L1 fratelli nei prompt Fase 3 (flag `mappai_branch_boundaries_enabled`)
- ✅ Campo `ambito` su L1: template Fase 1 genera keyword di perimetro, propagato a tutti i pass
- ✅ Phase 1.5: validazione L1 opzionale (conservativa, utile solo come rete di sicurezza)

### Da fare subito (prossima sessione)
1. **Test Kimi-K2.6 con pipeline completo** — TODO §1 (fix responseSchema applicato, ora si può)
2. **UI Piano 1.2 — pannello suggerimenti strutturali** — TODO §4
3. **Test KG con lenti AREA DISCIPLINARE** — TODO §2
4. **Installer da rifare** (Intel x64, Linux, Windows) — 15 min, comando pronto

### Da fare dopo
5. Chunking map-reduce per Infomaniak (TODO backlog §11)
6. Refactoring CSS (703 `!important`)
7. Pulizia root progetto (20 script Python, file .bak)
8. Decomposizione `app.js` in moduli separati

### Flag feature disponibili (tutti gated da localStorage)
| Flag localStorage key | Funzione | Default |
|---|---|---|
| `mappai_jsonl_enabled` | JSONL sezionato in Fase 3 (solo Infomaniak) | OFF |
| `mappai_branch_boundaries_enabled` | Catalogo L1 fratelli nei prompt Fase 3 | OFF |
| `mappai_mm_phase4_enabled` | Merge + cross-link semantici post-gen | OFF |
| `mappai_mm_phase5_enabled` | Riclassificazione L2/L3 mal collocati | OFF |
| `mappai_l1_validation_enabled` | Validazione L1 dopo Fase 1 (conservativa) | OFF |

**Comandi console:**
```js
MappAIMetrics.enableJSONL()            MappAIMetrics.disableJSONL()
MappAIMetrics.enableBranchBoundaries() MappAIMetrics.disableBranchBoundaries()
MappAIMetrics.enablePhase4()           MappAIMetrics.disablePhase4()
MappAIMetrics.enablePhase5()           MappAIMetrics.disablePhase5()
MappAIMetrics.enableL1Validation()     MappAIMetrics.disableL1Validation()
MappAIMetrics.report()                 // Markdown in clipboard
```

### Branch git attivi
| Branch | Ruolo |
|--------|-------|
| `main` | baseline stabile — default branch |
| `global` | CSS/HTML refactoring (style.css, index.html) |
| `dev` | JS/AI logic (app.js, prompts) |
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

Giacomo è un ex insegnante in malattia per burnout autistico.
MappAI è il suo progetto principale — ha investito ~900 ore.
Ha già adesioni da professionisti dell'educazione svizzeri.
Lavora come vibecoder usando IDE agentici (Antigravity, Claude Code).
Preferisce approcci graduali, spiegazioni chiare, zero panico.
Ogni modifica deve essere reversibile e ben documentata.
