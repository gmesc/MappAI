# TODO.md — MappAI Prossima Sessione
> Priorità in ordine decrescente. Aggiornato: 3 giugno 2026 (sera).

---

## ☀️ PROSSIMA SESSIONE INIZIA QUI

**Obiettivo sessione suggerito**: decidere sovrapposizione lenti/discipline (design),
poi UI Piano 1.2 — pannello suggerimenti strutturali + 4 regole `MIND_MAP_BRANCH_IT`.

**Branch attivo**: `feat/structural-suggestions`
**Stato**: working tree pulito (auto-save hook attivo).

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

### 1. Test KG con lenti AREA DISCIPLINARE attive
**Stato**: non testato. Rischio noto (sessione 31 maggio): lenti creavano KG sparsi
(37K token, 13 nodi) per anomalia da investigare. Prima di produzione:
- Rigenerare KG fotosintesi 4aMEDIA con alcune lenti attive su `gemini-2.5-flash-lite`
- Misurare `MappAIStructureAnalyzer.analyzeCurrentMap()` — density non deve scendere
  sotto 1.3 rispetto al baseline 1.59 senza lenti
- Investigare la causa dell'anomalia 37K token (punto 10 backlog)

### 2. ✅ Mirror template KG su varianti Student e EN — CHIUSO
Completato sessione 2 giugno 2026 sera.

### 3. UI Piano 1.2 — pannello suggerimenti strutturali
**Dipendenza**: `mappai-structure-analyzer.js` (✅ stabile) + analisi god_node fix (✅)
**Stato**: non ancora iniziato.
**Da costruire**:
- Pannello `#structural-suggestions-panel` con card per ogni suggerimento
- Primitiva `highlightSubgraph(nodeIds)` per evidenziare il sottografo
- Bottone "Mostra percorso" sui keystone/meaning_hub
- Entry point: bottone nella toolbar mappa (accanto a "Analizza")

### 4. Template `MIND_MAP_BRANCH_IT` — 4 regole mancanti
**Origine**: analisi GEMMA vs MISTRAL (sessione 1 giugno).
Regole da aggiungere in `MIND_MAP_BRANCH_IT` e `MIND_MAP_BRANCH_INFOMANIAK_IT`:
1. Anti-date nei label
2. Anti-lista nei label (elenchi con virgole)
3. Anti-duplicato cross-ramo
4. Concetti pivotali a L2
**File**: `prompts_config.json` e `public/prompts_default.json`

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
