# TODO.md — MappAI Prossima Sessione
> Priorità in ordine decrescente. Aggiornato: 5 giugno 2026 (cherry-pick merge/relink su dev).

---

## ☀️ PROSSIMA SESSIONE INIZIA QUI

**Obiettivo sessione suggerito**: testare Kimi-K2.6 con il pipeline completo (ora che il fix
`responseSchema` Infomaniak è applicato alla Fase 1), poi valutare se i risultati
giustificano raccomandare Kimi come modello di default per Infomaniak.

**Branch attivo**: `feat/structural-suggestions`
**Stato**: working tree pulito (auto-save hook attivo).

**Setup console per riprendere (5 flag disponibili):**
```js
MappAIMetrics.enableJSONL()             // Strategia 1A
MappAIMetrics.enableBranchBoundaries()  // Strategia A — ambits L1
MappAIMetrics.enablePhase4()            // merge + cross-link semantici
MappAIMetrics.enablePhase5()            // riclassificazione mal-collocati
// MappAIMetrics.enableL1Validation()   // Pass 1.5 — no-op su run buoni, skip
```

**Per rivedere risultati salvati:**
```js
MappAIMetrics.list()                    // tutti gli snapshot
MappAIMetrics.diff(MappAIMetrics.load('X'), MappAIMetrics.load('Y'))
```

---

---

## ✅ COMPLETATO — Sessione 4 giugno 2026 (mattino/pomeriggio — MM quality pipeline)

### `dev-console-metrics.js` — toolkit metriche dev console
- ✅ File `public/js/dev-console-metrics.js` caricato automaticamente da `index.html`
  (dopo `mappai-node-styling.js`). Nessun copia/incolla necessario.
- ✅ Bugfix critico: `appState` è `let` in `app.js` → non è su `window`. Aggiunto
  `_getAppState()` con fallback `typeof appState !== 'undefined'`.
- ✅ Auto-metriche dopo ogni generazione: hook su `renderGraph` con debounce 2s,
  soglia minima 3 nodi/link, auto-save in `localStorage`.
- ✅ `MappAIMetrics.report()` — report Markdown unificato copiato in clipboard:
  topic, model, flags, compact metrics, L1, L2 per ramo, suggerimenti per tipo, log.
- ✅ Log capture automatico: hook `console.log/warn/error` con pattern matching
  selettivo (cattura `[Phase*]`, `[JSONL]`, `[MappAI*]`, troncamenti, errori rami).
  Bugfix CSS stripping (argomenti CSS-style erano mangiati dalla regex).
- ✅ `MappAIMetrics.save/load/loadLast/list/remove/clearAll/diff` — persistenza localStorage.
- ✅ Comandi completi: `basic`, `relations`, `crosslinks`, `levels`, `groups`, `degree`,
  `betweenness`, `sources`, `studyStatus`, `structural`, `truncations`,
  `enableJSONL/disableJSONL/jsonlStatus`, `enablePhase4/5`, `enableBranchBoundaries`,
  `enableL1Validation`, `phase4/5Status`, `branchBoundariesStatus`, `l1ValidationStatus`.

### Strategia 0 — Rilevamento troncamenti (`MappAITruncationTracker`)
- ✅ `window.MappAITruncationTracker` in `app.js`: registra ogni chiamata API con
  model, provider, finishReason, requestedMax, candidateTokens, ts.
- ✅ `_detectTruncation(response)`: riconosce `MAX_TOKENS` (Gemini) e `length` (Infomaniak/OpenAI).
- ✅ Hook in `fetchModelAPI`: ogni risposta annotata, warning immediato se troncata.
- ✅ Reset automatico a ogni nuova generazione (hook su `MappAITruncationTracker.reset`).
- ✅ Diagnostica `salvageTruncatedJSON`: ora distingue "JSON malformato" vs "troncamento confermato".
- ✅ `MappAIMetrics.truncations()`: report con chiamate/troncate/tasso/breakdown modello.
- ✅ Colonna `Trunc` in `.table()`: `⚠️ 2/12` o `✓ 0/12`.
- ✅ `MappAIMetrics.save()` include `apiCalls`, `truncatedCalls`, `truncationRate` nel diff.

### Strategia 1A — JSONL sezionato (resistenza al troncamento Infomaniak)
- ✅ `window.parseJSONLResponse(text)` in `app.js`: parser tollerante con sezioni
  `===NODES===` / `===LINKS===` / `===MERGES===` / `===CROSSLINKS===` + varianti header.
  7/7 test unitari verdi (troncamento, markdown, fallback no-header, preambolo testuale).
- ✅ `window.buildBranchPromptJSONL(branch, opts)` — prompt JSONL per Fase 3.
- ✅ `window.isJSONLEnabled()` — feature flag `mappai_jsonl_enabled + infomaniak`.
- ✅ Hook condizionale nel branch expansion loop (Fase 3): `if (useJSONL)` → prompt e
  parser JSONL, altrimenti path JSON legacy.
- ✅ Payload Infomaniak senza `responseMimeType`/`responseSchema` in modalità JSONL.
- ✅ Fix `normalizeKeys`: Mistral produce `"id "` (chiave con spazio) → ora recuperato.
- ✅ Fix double-escape: Mistral produce `{\"id\":\"X\"}` → 3 tentativi di parse in cascade.
- ✅ Fix `isValid(obj, kind)`: scarta oggetti senza `id+label` (nodi) o `source+target` (link)
  prima che arrivino al consumer — previene `TypeError: Cannot read ... toLowerCase`.
- ✅ Log `[JSONL] Esempi righe scartate` con campioni delle righe malformate (debug).
- ⚠️ **Limiti noti Mistral Small**: produce ancora JSON rotto su rami profondi (~30% loss
  su rami Difesa/Politica). Il problema è intrinseco al modello, non al parser.

### Fix `maxOutputTokens` Mistral Small + Infomaniak Fase 1
- ✅ `getMaxOutputTokens` Mistral/Mixtral: 3000 → **8192** (riduce troncamenti Fase 3).
- ✅ Fase 1 (`payloadL1`): rimosso `responseMimeType + responseSchema` per Infomaniak.
  Fix necessario per Kimi-K2.6 che restituiva 0 caratteri con lo schema attivo.

### `MIND_MAP_BRANCH_IT/EN` — 4 regole anti-Mistral
- ✅ Regola 11: LABEL SENZA DATE (`"1914-1918"` è SBAGLIATO)
- ✅ Regola 12: LABEL SENZA LISTE (virgole che separano elementi)
- ✅ Regola 13: NIENTE DUPLICATI CROSS-RAMO (suggerisci link verso ID esistente)
- ✅ Regola 14: CONCETTI PIVOTALI A L2 (non seppellirli a L3/L4)
  Applicate su `prompts_default.json` e `prompts_config.json`, IT + EN.

### Strategia B — Phase 4 (consolidamento semantico post-generazione)
- ✅ `window.isPhase4Enabled()` — flag `mappai_mm_phase4_enabled + mindmap`.
- ✅ `window.buildPhase4Prompt(nodes)` — compatto (id, Lx, label, desc[:60]).
  Ora include catalogo L1 con ambits, e prompt rinforzato: merge aggressivi su
  duplicati cross-ramo con 6 esempi concreti ("Oro Nazista" / "Oro controverso" = fondere).
- ✅ `window.executePhase4Consolidation()` — applica MERGES (`executeMerge`) +
  CROSSLINKS validati (no self-loop, no duplicati, rimappa drop→keep).
- ✅ Hook nel flusso: dopo `dedupeNodesAsCrossLinks`, prima del filtro link orfani.
- ✅ Report dettagliato: `applied/skipped/errors` per merges e crosslinks.
- ✅ Risultato su run buoni: crossRatio fino al **20.8%** (vs 0% baseline).

### Phase 5 — Riclassificazione semantica
- ✅ `window.isPhase5Enabled()` — flag `mappai_mm_phase5_enabled + mindmap`.
- ✅ `window.buildPhase5Prompt(nodes, links, l1NodesData)` — mostra L1 con ambiti
  + figli L2 correnti + candidati L2/L3 con L1 attuale.
- ✅ `window.executePhase5Reclassification()` — parsa `===RECLASSIFY===`, applica
  spostamenti (rimuove link gerarchico parent→node, aggiunge link nuovoL1→node,
  aggiorna `node.group`). Max 8 op per run.
- ✅ **Safeguard anti-svuotamento**: se ramo sorgente ha ≤2 L2, spostamento rifiutato.
- ✅ Risultato: `misplaced` da 2 → 0, `undeveloped_branch` da 9 → 2-4.
- ✅ Log dettagliato operazioni visibile nel `report()`.

### Strategia A — Branch Boundaries (confini di ramo in Fase 3)
- ✅ `window.isBranchBoundariesEnabled()` — flag `mappai_branch_boundaries_enabled + mindmap`.
- ✅ `buildSiblingL1Catalog(currentBranchId)` — inietta nel prompt branch la lista
  degli ALTRI L1 con label, rel, **e ambito semantico** (se disponibile).
- ✅ Iniezione in entrambi i path (JSON inline e builder JSONL).
- ✅ Risultato: `undeveloped_branch` da 9 → **2** sul run migliore.
- ⚠️ Trade-off: prompt più lungo → Mistral taglia chunks → `sourceCovRatio` -12%.

### Campo `ambito` sugli L1 (memoria semantica cross-ramo)
- ✅ Template `L1_MACRO_CATEGORIES_IT/EN`: aggiunto campo `ambito` (3-5 keyword)
  nell'esempio di output. Il modello genera `label + rel + ambito` insieme.
- ✅ `l1NodesData` propaga `ambito` al nodo L1 in `appState.db.nodes`.
- ✅ Usato da: BranchBoundaries (prompt Fase 3), Phase 4 (catalogo L1 con ambiti),
  Phase 5 (catalogo L1 con ambiti + figli L2 correnti).
- ⚠️ Mistral Small genera ambits non ortogonali (es. "invasione" in Neutralità invece di Difesa).
  Kimi-K2.6 da testare — probabilmente più preciso.

### Phase 1.5 — Validazione semantica L1 (feature opzionale)
- ✅ `window.validateL1Categories(l1Data, rootLabel)` — chiamata AI dopo Fase 1
  che verifica sinonimi e meta-categorie. Prompt massimamente conservativo
  ("DEFAULT = nessuna modifica"). Guard anti-overcorrection: se >50% label
  modificati, rigetta output e mantiene originale.
- ✅ Hook nei 2 punti Fase 1, gated da `mappai_l1_validation_enabled`.
- 📊 **Risultato empirico**: su run buoni → "L1 già coerenti, nessuna modifica" (no-op).
  Utile come rete sicurezza ma non migliora sistematicamente.
  **Raccomandazione: lasciare spento di default**.

---

## ✅ COMPLETATO — Sessione 3 giugno 2026 (sera — continua)

### Feature 4b: Dropdown famiglie + Link Bidirezionali
- ✅ **`window.showLinkFamilyPrompt(srcLabel, tgtLabel, callback)`** — modale `#link-family-modal`
  con lista verticale delle 7 famiglie `EDGE_FAMILIES` (colorate, icona + etichetta).
  Clic su famiglia pre-compila l'input con verbo default (`FAMILY_DEFAULT_REL`).
  Toggle **↔ Bidirezionale** passa `bidir=true` al callback.
  Sostituisce `showPrompt` nel flusso `linkingState` (~L.6139 di `app.js`).
- ✅ **Link bidirezionali** — modello dati: `{ ..., bidirectional: true }` opzionale.
  Rendering: `<line>` → `<path>` per tutti i link (necessario per Bezier).
  Link bidir: curva quadratic Bezier con offset perpendicolare 40px.
  Marker `arrowhead-rev` / `arrowhead-rev-{famiglia}` con `orient="auto-start-reverse"`.
  Lente Relazioni aggiornata per handle `marker-start` colorato su link bidir.
  ⚠️ `'line.link'` → `'.link'` ovunque nel codice D3.

---

## ✅ COMPLETATO — Sessione 3 giugno 2026 (sera)

### UI/UX — modal e design system
- ✅ **Sistema `.pm-*`** — gerarchia tipografica prompt-modal (§11 `@layer components`
  in `index.html`): `pm-icon-wrap`, `pm-title`, `pm-subtitle`, `pm-body-text`, `pm-badge`
  (+ varianti info/ok/warn/mode-mm/mode-kg), `pm-section`, `pm-section-title`,
  `pm-option`, `pm-option-label`, `pm-option-desc`, `pm-btn-cancel`, `pm-btn-primary`.
- ✅ **Modal Stampa Dossier** aggiornato: header con `pm-icon-wrap` + `pm-title`,
  badge modalità con `pm-badge`, radio/checkbox con `pm-option`, footer con
  `pm-btn-cancel`/`pm-btn-primary`.
- ✅ **Modal link family** (`#link-family-modal`): layout bottoni famiglie cambiato
  da `grid-cols-4` a colonna unica (`flex flex-col`), bottoni orizzontali (`flex-row`,
  `w-full`, `text-sm`), modal allargato a `max-w-[600px]`.

### Timeline (`mappai-timeline.js`)
- ✅ **Titolo progetto dinamico** — `window._getTimelineProjectName()`: legge
  `appState.rootNodeLabel` → nodo L0 → `'MappAI'`. Funziona anche su KG senza L0.
- ✅ **Deduplicazione eventi** — dopo AI pass 1 + regex safety net, filtra duplicati
  su chiave `(anno, label normalizzata)`. Fix per "Piano Wahlen x2".
- ✅ **Modal semplificato** — 4 checkbox → 2 radio (Compatta / Con contesto).
  Compatta: nessun contesto richiesto all'AI. Con contesto: max 3 frasi / 300 char.
- ✅ **Migrazione al design system pm-*** — icone Lucide (`calendar-clock`, `zap`, `x`),
  niente emoji, niente `Space Mono` nel modal, palette indigo uniforme con Stampa Dossier.
- ✅ `openTimelineView` e `_renderTimeline` ora accettano `opts.showContext` — il blocco
  "CONTESTO DALLA FONTE" è condizionale.

### Bug fix
- ✅ **Collisione `group` dopo merge/relink** (`mappai-node-merge.js`): aggiunta
  `_recalcGroups(parentId, group, nodes, links)` e `_nextFreeGroup(nodes)`.
  - `executeMerge` step 7b: propaga `B.group` a tutto il sottoalbero di B.
  - `executeRelink`: se A diventa L1 (genitore = root L0) assegna un intero libero;
    altrimenti eredita `newParent.group`. Poi `_recalcGroups` propaga all'intero sottoalbero.
  - Effetto: due L1 non possono più condividere lo stesso group → color picker isolato.

---

## ✅ COMPLETATO — Sessione 5 giugno 2026 (cherry-pick dev)

### Porting merge/relink su branch `dev`
- ✅ `mappai-node-merge.js` copiato su `dev` (Fondi con... + Cambia Link + helper)
- ✅ `dev-console-metrics.js` copiato su `dev` (MappAIMetrics toolkit)
- ✅ `index.html` su `dev`: modale `#link-family-modal` + tag script per entrambi i file
- ✅ `app.js` su `dev`:
  - `EDGE_FAMILIES` aggiornato (aggiunta `keywords` per chip-selector + famiglia `analogia`)
  - `FAMILY_DEFAULT_REL` costante aggiunta
  - `window.showLinkFamilyPrompt()` portata integralmente
  - Flusso click nodo: `showPrompt` → `showLinkFamilyPrompt` + flag `bidirectional`
  - Dispatch `mergeState`/`relinkState` aggiunto prima del blocco `linkingState`
  - Voci menu contestuale "Fondi con..." (ambra) e "Cambia Link" (azzurro, solo MM)
  - Handler `ctxAction('merge')` e `ctxAction('relink')` aggiunti

---

## ✅ COMPLETATO — Sessione 3 giugno 2026 (pulizia repo)

### Pulizia branch git
- ✅ Eliminati 3 branch obsoleti: `MappAI_studente` (vecchio, era default su GitHub),
  `MappAI_main` (alias esatto di `main`), `test-macos-mappai-packaging` (test CI maggio).
- ✅ Rimosso worktree orfano di Antigravity agganciato a `test-macos-mappai-packaging`.
- ✅ `main` impostato come default branch su GitHub.
- ✅ Contenuto utile salvato nel `CLAUDE.md`: DAL Protocol (vault retrocompatibilità)
  e nota compatibilità iPadOS — estratti da `.agents/rules/` del branch eliminato.
- Branch rimasti: `main`, `global`, `dev`, `feat/structural-suggestions`,
  `feat/kg-hub-extraction`, `MappAI_iPad`, `MappAI_iPad_studente`.

---

## ✅ COMPLETATO — Sessione 3 giugno 2026

### `mappai-node-merge.js` — editing strutturale del grafo
- ✅ **"Fondi con..."** (context menu, icona `git-merge`, ambra): merge nodo A in B.
  I figli di A diventano figli di B; link entranti/uscenti rimappati; self-loop e
  duplicati rimossi; `sourcesDict`/`customColors` uniti; livelli ricalcolati (MM).
  Disponibile in MM e KG, visibile anche in studentMode.
- ✅ **"Cambia Link"** (context menu, icona `unlink`, blu, solo MM): riassegna il
  genitore di A. Rimuove tutti i link `target=A`, aggiunge nuovo link con relazione
  scelta via `showLinkFamilyPrompt`. Livelli di A e sottoalbero ricalcolati.
- ✅ Pattern: `mergeState`/`relinkState` con banner `#mode-hint`, ESC e click-sfondo
  per annullare — stesso pattern di `linkingState` già esistente.
- ✅ Caricato in `index.html` dopo `mappai-structure-analyzer.js`.
- ⚠️ Rischio noto (non bloccante): in KG, link paralleli con `rel` diversi verso lo
  stesso target vengono deduplicati silenziosamente (si tiene il primo).

---

## ✅ COMPLETATO — Sessione 2 giugno 2026 (pomeriggio)

### Sperimentazione Hub-Pass KG — conclusione: non efficace
- ✅ Implementata `extractKnowledgeGraphHubPass()` in `app.js` (4 fasi: hub
  extraction → concetti per hub → relazioni → arricchimento)
- ✅ Template `KG_HUB_NODES_IT` + `KG_HUB_RELATIONS_IT` in entrambi i JSON
- ✅ Testato su Google (flash-lite) e Infomaniak (GEMMA 31B)
- **Conclusione**: hub-pass PEGGIORA entrambi i provider — density 1.82 vs
  1.91 Google, 1.29 vs 1.37 GEMMA. Gap Google/GEMMA è strutturale al
  modello, non prompt-addressable via Fase 2.
- ✅ Dispatch ripristinato a `extractKnowledgeGraphMultiPass` (hub-pass
  rimane nel codice ma non è richiamato)

### Benchmark completo densità KG per modello (documento: fotosintesi 4aMEDIA, 2 PDF)
| Modello | Density | Nodi | Link | Cross-link% | Topology |
|---------|---------|------|------|-------------|---------|
| **gemini-2.5-flash-lite** | **1.59** | **41** | **65** | **43.1%** | networked ✅ |
| gemini-3.1-flash-lite | 1.91 | 33 | 63 | 34.9% | networked ✅ |
| GEMMA 31B (Infomaniak) | 1.37 | 35 | 48 | ~30% | networked ✅ |
- **Raccomandazione**: `gemini-2.5-flash-lite` per KG (più nodi, più cross-link, gratuito)
- **GEMMA ceiling**: ~1.4 density indipendente dal prompt — accettare il gap

### Fix stabilità per modelli Gemini 2.5/3.x
- ✅ `extractResponseText(response)` — helper null-safe che gestisce:
  - `candidates` undefined (safety block, errore API)
  - Thinking mode (Gemini 2.5+): trova la part non-`thought` nelle `parts`
  - Messaggio d'errore leggibile con `blockReason`/`finishReason`
  - Sostituisce 4 accessi non protetti in `extractKnowledgeGraphSinglePass`
    e `extractKnowledgeGraphMultiPass` (phase 1, 2, 3)
- ✅ `getMaxOutputTokens`: scala ×2 (cap 16384) per `gemini-2.5*` e `gemini-3*`
  — previene "Unexpected end of JSON input" su Fase 3 enrichment
- ✅ Fase 3 multipass: base token 3000 → 5000

### Ottimizzazione dropdown modelli Google
- ✅ `MODEL_KB` aggiornato con i 17 modelli reali dall'API Gemini:
  `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-3.1-pro`,
  `gemini-3-flash`, `gemini-3-pro`, `gemini-2.5-flash-lite`,
  `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-flash`, `gemini-pro`,
  alias `-latest`, deprecated 2.0/1.5
- ✅ Bug fix: `matchModelKB` ora ordina i pattern per lunghezza decrescente
  (longest-match-wins) — `gemini-2.5-flash-lite` matchava erroneamente
  `gemini-2.5-flash` perché il pattern più corto veniva trovato prima
- ✅ Filtro `deprecated: true`: modelli 2.0 e 1.5 nascosti dal dropdown
- ✅ Sort per stabilità in `renderModelSelect`: modelli stabili prima di
  preview/exp all'interno di ogni tier
- ✅ Note density KG nei tooltip modello (visibili hover + pannello capabilities)
- ✅ Il dropdown è guidato esclusivamente dall'API — MODEL_KB è solo
  metadata di arricchimento (tier, costo, note)

### Fix god_node message in mappai-structure-analyzer.js
- ✅ Messaggio ora context-aware su livello + modalità:
  - L1 + KG → "Super-Hub molto connesso — normale, valuta di suddividerlo"
  - L1 + MM → "ramo principale con troppi figli — valuta di suddividerlo"
  - L2 (qualsiasi) → messaggio originale di promozione "sposta a L1/L2"

---

## ✅ COMPLETATO — Sessione 1-2 giugno 2026 (mattina)

### `mappai-structure-analyzer.js` — modulo analisi strutturale
- ✅ Creato e cablato in `index.html` dopo `mappai-quiz-print.js`
- ✅ 6 analisi: godNodes, misplacedNodes, underutilizedClusters, leafIsolation
  (per-livello), lowConnectivity, structuralKeystones (Tarjan), meaningHubs (Brandes)
- ✅ Auto-adattivo su modalità (mindmap/kg) e densità (tree-like/networked)
- ✅ `detectMode()` deduce la modalità dagli ID quando `appState.extractionMode` manca
- ✅ Filtro ponti-foglia (grado < 2 scartati), cap a 4 ponti significativi

### Template KG riscritto — relazioni di ragionamento
- ✅ `KNOWLEDGE_GRAPH_SINGLE_IT`: blocco "RELAZIONI — IL CUORE DEL GRAFO"
  con link laterali obbligatori + vocabolario tipizzato + divieto "correlato a"
- ✅ `KG_REL_ENUM` costante in `app.js` + orphan healer BFS
- ✅ `window.markKgCrossLinks()` in `app.js`
- Risultati baseline: Google density 1.09→**2.18**, 0% generiche

---

## ✅ COMPLETATO — Sessione 2 giugno 2026 (sera)

### Node styling KG 1+2 — ruolo strutturale + bridge marking
- ✅ `mappai-node-styling.js` — nuovo modulo (window.MappAINodeStyling)
  - `annotate(nodes, links, groupColors)`: ruolo (_role: l1/keystone/ordinary/leaf)
    e bridge info (_bridgeInfo: kind mono/bridge/mixed + segments colore+frazione)
    basati su 1-hop diretto (non BFS 3-hop — più semanticamente preciso)
  - `getRingSegments(node)`: restituisce i segmenti per l'anello D3
- ✅ Integrato in `app.js`: BFS 3-hop sostituito, rendering segmenti usa _strokeW
  (leaf=2px, ordinary=3px, keystone=5px), cascade animation usa _opacity
  (leaf=0.65, altri=1.0)
- ✅ Wired in `index.html` dopo mappai-structure-analyzer.js
- ✅ Test verificato console (grafo fotosintesi 71 nodi / 117 link / density 1.65):
  l1:5, keystone:8, ordinary:20, leaf:0 (0 foglie = KG ben connesso ✅)
  bridge:8, mixed:5, mono:15 — 8 ponti semantici reali (Stomi, Fotosistema I, ecc.)
- ✅ Piano Edge Coloring toggle salvato in `docs/PLAN_edge_coloring_toggle.md`
  (6 famiglie daltonismo-safe, linee esatte, 7 step implementazione)

### Test KG con lenti AREA DISCIPLINARE
- ✅ Nessuna anomalia su gemini-2.5-flash-lite: density 1.65, cross-link 61.5%
  con lenti attive. L'anomalia "37K token / 13 nodi" del 31 maggio non si ripresenta.
  TODO punto 10 chiudibile.

### Mirror template KG su varianti Student e EN
- ✅ `KNOWLEDGE_GRAPH_SINGLE_STUDENT_IT` + `_EN`: blocco "RELAZIONI — IL CUORE
  DEL GRAFO" applicato. Linguaggio adattato al profilo studente. Committato in 59d9211.

---

## 🔴 PRIORITÀ ALTA

### 1. Test Kimi-K2.6 con pipeline completo
**Stato**: fallito per bug responseSchema (ora fixato — 4 giugno 2026).
**Prossima azione**: rigenerare MM Svizzera con Kimi-K2.6 + tutti e 4 i flag attivi.
**Aspettative**: JSONL pulito (zero righe scartate), ambits L1 ortogonali,
merges Phase 4 effettivi, `undeveloped_branch ≤ 2`, `crossRatio ≥ 20%`.
**Comandi**:
```js
MappAIMetrics.save('kimi_full_setup')
// Verifica ambits: appState.db.nodes.filter(n => n.level===1).map(n => ({label:n.label,ambito:n.ambito}))
MappAIMetrics.report()
MappAIMetrics.diff(MappAIMetrics.load('phase4_JSONL_3'), MappAIMetrics.load('kimi_full_setup'))
```

### 2. Test KG con lenti AREA DISCIPLINARE attive
**Stato**: non testato. Rischio noto (sessione 31 maggio): lenti creavano KG sparsi
(37K token, 13 nodi) per anomalia da investigare. Prima di produzione:
- Rigenerare KG fotosintesi 4aMEDIA con alcune lenti attive su `gemini-2.5-flash-lite`
- Misurare `MappAIStructureAnalyzer.analyzeCurrentMap()` — density non deve scendere
  sotto 1.3 rispetto al baseline 1.59 senza lenti
- Investigare la causa dell'anomalia 37K token (punto 10 backlog)

### 3. ✅ Mirror template KG su varianti Student e EN — CHIUSO
Completato sessione 2 giugno 2026 sera.

### 4. UI Piano 1.2 — pannello suggerimenti strutturali
**Dipendenza**: `mappai-structure-analyzer.js` (✅ stabile) + analisi god_node fix (✅)
**Stato**: non ancora iniziato.
**Da costruire**:
- Pannello `#structural-suggestions-panel` con card per ogni suggerimento
- Primitiva `highlightSubgraph(nodeIds)` per evidenziare il sottografo
- Bottone "Mostra percorso" sui keystone/meaning_hub
- Entry point: bottone nella toolbar mappa (accanto a "Analizza")

### 5. ✅ Template `MIND_MAP_BRANCH_IT` — 4 regole mancanti — CHIUSO
Completato sessione 4 giugno 2026. Regole 11-14 aggiunte a IT + EN.

---

## 🟠 PRIORITÀ MEDIA

### 5. Testare KG con gemini-2.5-flash e gemini-3.5-flash
- `gemini-2.5-flash` (non-lite): da verificare density e cross-link
- `gemini-3.5-flash`: testato brevemente (JSON truncation era bug nostro, ora fixato)
  — rigenerare con fix applicato
- Aggiornare note MODEL_KB con i dati reali dopo il test

### 6. Testare Kimi-K2.6 (256K context) su Infomaniak
- Generare MM e KG con Kimi-K2.6
- Verificare che `json_schema` funzioni (o se serve workaround come Qwen)
- Potenziale alternativa a GEMMA per corpus molto lunghi

### 7. Template Liceo per Mistral Small (`MIND_MAP_BRANCH_LICEO_IT`)
- Profondità L5, cap 40 nodi, regole bipolarità storica, causa-effetto
- Logica selezione: `userProfile.grade` contiene "Liceo"

### 8. Nuovo template profilo studente — KG
- `KNOWLEDGE_GRAPH_SINGLE_STUDENT_IT` manca delle ottimizzazioni
  del template standard → dopo mirror (punto 2)

### 9. Avviso UI per Apertus in modalità KG
- Warning quando utente seleziona Apertus con KG attivo
- Punto di inserimento: `window.setMode` o fetch con provider=infomaniak + apertus + kg

---

## 🟡 PRIORITÀ BASSA / BACKLOG

### 10. Investigare anomalia token KG GEMMA con lenti attive (37K vs 65K)
**Sintomo**: KG GEMMA LENTI 4aMEDIA → 37K token prompt, solo 13 nodi.
Senza lenti → 65K token, 35 nodi. Causa ipotizzata: con `focusTopic` non vuoto
qualcosa in `extractKnowledgeGraphSinglePass` tronca il testo sorgente.

### 11. Chunking map-reduce Fase 1 MM (solo Infomaniak, context 65K)
Helper `window.chunkText(text, dimChunk, overlap)` — solo per Infomaniak.
Google (1M+ context) non ne ha bisogno.

### 12. Dedup cross-ramo MM: test su mappe reali
`dedupeNodesAsCrossLinks` — la regex è conservativa ma non estensivamente testata.

### 13. Refactoring CSS (703 `!important`)
Guerra di specificità tra Tailwind e CSS custom. Non urgente.

### 14. Decomposizione `app.js` (~13.500 righe)
Candidati: funzioni KG, MM, D3, vault, UI landing.

### 15. Pulizia root progetto
~20 script Python e file `.bak` nella root.
Branch git già puliti (3 giugno 2026) — vedi sezione COMPLETATO sopra.

---

## 🔮 IDEE FUTURE

### Diff strutturale temporale — valutazione formativa
Salvare snapshot del grafo per sessione e misurare crescita della rete concettuale.
Metriche: density, cross-link, betweenness dei cardini. Output: delta sessione.
Dipendenze: `analyzeStructure()` già pronto. Serve persistenza snapshot nel vault.
**Da riprendere dopo UI Piano 1 + Piano 2.**

---

## 📊 BENCHMARK KG — DATI DI RIFERIMENTO (2 giugno 2026)
Documento: "L'albero come sistema vivente" — fotosintesi 4aMEDIA (2 PDF, ~65K token)
Prompt: `extractKnowledgeGraphMultiPass` con template originale (nessuna modifica cross-hub)

| Modello | Provider | Density | Nodi | Cross-link% | Note |
|---------|----------|---------|------|-------------|------|
| gemini-2.5-flash-lite | Google | 1.59 | 41 | 43.1% | ⭐ best overall |
| gemini-3.1-flash-lite | Google | 1.91 | 33 | 34.9% | best density |
| GEMMA 4 31B-it | Infomaniak | 1.37 | 35 | ~30% | ceiling modello |

**Lezioni apprese (non ripetere):**
- ❌ Cap "max 5-6 link per nodo" in Fase 2 → density crolla (1.91→1.15 su flash-lite)
- ❌ Clausola cross-hub obbligatoria in Fase 2 → genera MENO link totali, non più
- ❌ Hub-Pass non migliora GEMMA: node count ok (35) ma density invariata
- ✅ `getMaxOutputTokens` deve scalare per modelli 2.5/3.x (ora fixato)
- ✅ Gap Google/GEMMA è strutturale — GEMMA genera meno link laterali per design
