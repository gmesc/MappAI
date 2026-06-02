# TODO.md — MappAI Prossima Sessione
> Priorità in ordine decrescente. Aggiornato: 2 giugno 2026 (sera).

---

## ☀️ PROSSIMA SESSIONE INIZIA QUI

**Obiettivo sessione**: implementare **Modalità B — Estrazione per hub** nel KG
multi-pass (vedi sezione dedicata sotto). Aprire una NUOVA conversazione con
il briefing specifico di quella feature.

**Stato branch**: tutto mergeato su `dev`. Branch attivo: `feat/kg-hub-extraction`
(da creare nella prossima sessione).

---

## ✅ COMPLETATO — Sessione 1-2 giugno 2026

### `mappai-structure-analyzer.js` — modulo analisi strutturale
- ✅ Creato e cablato in `index.html` dopo `mappai-quiz-print.js`
- ✅ 6 analisi: godNodes, misplacedNodes, underutilizedClusters, leafIsolation
  (per-livello), lowConnectivity, structuralKeystones (Tarjan), meaningHubs (Brandes)
- ✅ Auto-adattivo su modalità (mindmap/kg) e densità (tree-like/networked)
- ✅ Validato su 3 vault: MM GF GEMMA STORIA, KG Google, KG Infomaniak
- ✅ `detectMode()` deduce la modalità dagli ID quando `appState.extractionMode` manca
- ✅ Filtro ponti-foglia (grado < 2 scartati), cap a 4 ponti significativi

### Template KG riscritto — relazioni di ragionamento
- ✅ `KNOWLEDGE_GRAPH_SINGLE_IT`: blocco "RELAZIONI — IL CUORE DEL GRAFO"
  con link laterali obbligatori + vocabolario tipizzato + divieto "correlato a"
- ✅ `KG_REL_ENUM` costante in `app.js` — enum nello schema JSON (enforcement
  nativo su Google, vocabolario guida su Infomaniak)
- ✅ `window.markKgCrossLinks()` — marca `isCross:true` i link laterali in entrambe
  le funzioni KG (single-pass e multi-pass)
- Risultati: Google densità 1.09→**2.18**, 0% generiche, 55 tipi relazione

### Fix bug KG multi-pass
- ✅ Bug A: `tutorState` non serializzabile → IPC crash "object could not be cloned"
  Fix: `serializeTutorState()` in `saveMapVault` (app.js ~6225)
- ✅ Bug B2: `saveCurrentProject` passava `appState` raw all'IPC (nodi D3 circolari)
  Fix: payload minimo serializzabile in `saveMapJSON` call (app.js ~9804)
- ✅ Orphan healer: "correlato a" → "fa parte di" + BFS hub migliore
- ✅ Phase 2 maxOutputTokens: 3000 → 4096
- ✅ Sanitizzazione rel Devanagari da GEMMA ("। fa parte di" → "fa parte di")
- ✅ Multi-pass ON di default: `appState.multiPassMode: true` + chiamata silenziosa
  in `DOMContentLoaded`

### Risultati finali per provider
| Provider | Densità | "correlato a" | Topology |
|---|---|---|---|
| Google Gemini multi-pass | 2.18 | 0% | networked ✅ |
| Infomaniak GEMMA multi-pass | 1.37 | 0% | networked ✅ |

---

## 🔜 PROSSIMA FEATURE — Modalità B: Estrazione per hub

> Da implementare in una nuova conversazione / branch `feat/kg-hub-extraction`.

**Problema**: GEMMA multi-pass genera ~19-34 nodi invece di 33+ come Google,
perché la Fase 1 è conservativa su corpus lunghi. Il gap non è risolvibile solo
con prompt — serve un approccio architetturale diverso.

**Soluzione proposta** (ispirata a `extractMindMapMultiPass`):
```
Fase 0: estrai 4-5 super-hub (titoli macro-aree)
Fase 1a: "dimmi 8-10 concetti specifici di [HUB_A]"  ← 1 chiamata per hub
Fase 1b: "dimmi 8-10 concetti specifici di [HUB_B]"
...
Merge: i nodi arrivano già con group assegnato
Fase 2: link (molto più semplice: hub → figli già noti)
```

**Vantaggi**:
- Copertura uniforme per hub (non dipende dalla lunghezza del testo)
- Nodi già classificati → Fase 2 più efficace
- Allineato alla Fase 2.1 della ROADMAP (`EXTRACT_ENTITIES_RELATIONS_IT`)
- Riusa il pattern già validato di `extractMindMapMultiPass`

**File da creare/modificare**:
- `app.js`: nuova funzione `extractKnowledgeGraphHubPass()`
- `prompts_config.json`: nuovi template `KG_HUB_NODES_IT` + `KG_HUB_RELATIONS_IT`
- UI: nessuna modifica (stesso toggle multi-pass)

**Nota**: considerare anche **Gap-fill pass** (opzione A, più semplice) come
stepping stone prima di B se i tempi sono stretti: +1 chiamata "cosa manca?"
dopo la Fase 1 normale.

---

**Cosa è FATTO e VALIDATO oggi:**
- ✅ `mappai-structure-analyzer.js` completo: 6 analisi, auto-adattivo su modalità
  (MM/KG) e densità (tree/networked). Cablato in `index.html`. Test da console:
  `MappAIStructureAnalyzer.analyzeCurrentMap()`.
- ✅ Template KG riscritto → relazioni laterali + tipizzate. Google: densità 2.0,
  0% generiche. Infomaniak GEMMA: 1.31, 36% generiche (migliorato ma non al pari).
- ✅ `window.markKgCrossLinks()` in `app.js` (marca isCross sui link laterali).
- ✅ Refinement ponti-foglia nell'analizzatore.

**3 strade aperte (scegliere domani, in ordine di priorità suggerito):**
1. **Fix Causa C** — rimuovere `responseMimeType` dal payload KG per Infomaniak
   (`app.js` ~3438). È il pezzo che porta i provider svizzeri (GDPR) al livello di
   Google. Modifica isolata. → dettagli nella sezione "DA TESTARE SUBITO" sotto.
2. **Mirror template** su `KNOWLEDGE_GRAPH_SINGLE_STUDENT_IT` + `_EN` (copre la
   modalità studente, target BES/DSA). Modifica già validata, basso rischio.
3. **UI Piano 1.2** — pannello `#structural-suggestions-panel` con le card dei
   suggerimenti + primitiva `highlightSubgraph` per studio guidato dei percorsi.
   Keystone/meaning_hub ora validati su 2 provider → si può costruire con fiducia.

**Nota minore da rifinire:** il messaggio di `god_node` dice "sposta a L1/L2" anche
sui KG dove il nodo è già hub L1 → riformulare per modalità KG.

---

## 🧪 DA TESTARE SUBITO (modifica 1 giugno 2026 — ricchezza relazionale KG)

> Origine: l'analizzatore strutturale ha rivelato che i KG GEMMA/Infomaniak
> hanno densità ~1.09 con **0 cross-link** e 68% relazioni "correlato a".
> Causa: il template chiedeva solo link concetto→hub (grafo a stella), senza
> relazioni laterali di ragionamento né vocabolario tipizzato.

**Modifiche applicate (reversibili — backup in `*.bak`):**
1. `KNOWLEDGE_GRAPH_SINGLE_IT` (in `prompts_config.json` + `prompts_default.json`):
   - Aggiunto blocco "RELAZIONI — IL CUORE DEL GRAFO": richiede link LATERALI
     concetto↔concetto, non solo verso gli hub (≥ tanti link laterali quanti nodi).
   - Aggiunto vocabolario di relazioni di ragionamento (causa, produce, dipende
     da, si oppone a, precede…) e DIVIETO esplicito di "correlato a"/"relativo a".
2. `app.js` → nuova `window.markKgCrossLinks(nodes, links)`: marca `isCross=true`
   i link laterali (concetto↔concetto / hub↔hub), distinguendoli dall'ancoraggio
   gerarchico. Chiamata in `extractKnowledgeGraphSinglePass` e `MultiPass`.

**Da fare:**
- [ ] Rigenerare lo stesso KG (fotosintesi 4aMEDIA) su **Google** e verificare
  densità > 1.5 e presenza di `isCross:true`. Confronto con `analyzeCurrentMap()`.
- [ ] Rigenerare su **Infomaniak GEMMA** (rule §10.8: test su entrambi i provider).
- [x] **Test Google (Gemini)**: densità 2.0, cross-link 45%, generiche 0%, 55 tipi
  di relazione. ✅ Fix template pienamente efficace su Google.
- [x] **Test Infomaniak (GEMMA)**: densità 1.31 (da 1.09), cross-link 30% (da 0%),
  generiche 36% (da 68%), 20 tipi. ✅ Migliorato MA nettamente sotto Google.
- [x] **CAUSA C — REVISIONE DIAGNOSI (2 giugno 2026)**: la rimozione di
  `responseMimeType` ha PEGGIORATO la qualità (26 nodi → densità 0.96).
  Lo schema aiuta la completezza strutturale anche se degrada i rel.
  **Vera causa**: la Fase 2 multi-pass genera link solo per ~16/34 nodi,
  l'orphan healer riempiva i buchi con "correlato a".
  **Fix applicati**: (1) orphan healer → "fa parte di" + BFS per hub migliore;
  (2) p2 maxOutputTokens 3000→4096; (3) KG_REL_ENUM nello schema;
  (4) sanitizzazione rel Devanagari da GEMMA ("। fa parte di" → "fa parte di").
  **Risultato**: densità 1.37, 0% "correlato a", topology "networked" ✅.
  **Residuo aperto**: gap Google (2.18) vs Infomaniak (1.37) — GEMMA genera
  meno link laterali per design del modello, non risolvibile solo con prompt.
  Accettabile per ora; da monitorare con Piano 2 (auto-clustering).
- [x] **Refinement analizzatore**: `detectStructuralKeystones` ora scarta i ponti
  verso foglie (grado 1, trivali) e li limita a `bridgeCap=4`. Riduce il rumore su
  grafi networked a densità borderline (~1.3).
- [ ] Mirror della stessa modifica su `KNOWLEDGE_GRAPH_SINGLE_STUDENT_IT` e
  varianti `_EN` una volta validato il comportamento IT.

---

## 🔮 IDEE FUTURE (riprendere dopo Piano 1 + Piano 2)

### Diff strutturale temporale — valutazione formativa
> Origine: analisi topologica `mappai-structure-analyzer.js` (1 giugno 2026).
> Da riprendere SOLO dopo aver completato il pannello suggerimenti (Piano 1)
> e l'auto-restructure OPI (Piano 2).

**Idea**: salvare snapshot dello stato del grafo nel tempo e misurare come la
rete concettuale dello studente cresce sessione dopo sessione.

- Metriche da tracciare per snapshot: densità (link/nodi), profondità media,
  n° cross-link, n° community (Louvain), betweenness dei concetti-cardine.
- Output: grafico di crescita + delta tra due snapshot ("hai aggiunto 4
  cross-link e 1 catena causale rispetto alla scorsa settimana").
- **Valore pedagogico**: strumento di valutazione formativa per l'OPI —
  evidenza oggettiva del progredire della comprensione, non solo del contenuto.
- Dipendenze: riusa `analyzeStructure()` + `computeBetweenness()` già presenti
  nel modulo. Serve persistenza snapshot nel vault (es. `Snapshots/*.json`).
- Allineato alla filosofia BES/DSA: misura il percorso, non solo il risultato.

---

## 🔍 DA INVESTIGARE (emerso da graphify)

### A. Spiegare connessione checkAndInitIPadDemoVaults → arrayBufferToBase64()
Graphify ha segnalato questo accoppiamento come "sorprendente". Da chiarire:
- `checkAndInitIPadDemoVaults` (in `storageAdapter.js`) inizializza i vault demo
  al primo avvio su iPad — legge i file dal bundle e li scrive nell'IndexedDB.
- `arrayBufferToBase64()` viene chiamata **dentro** questa funzione per convertire
  i file binari (PDF, immagini degli allegati nei vault demo) in stringhe base64
  prima di salvarli in IndexedDB, che non supporta ArrayBuffer nativamente.
- L'accoppiamento è "non ovvio" perché sembra un'inizializzazione dati ma include
  una pipeline di encoding binario nascosta.
- **Da verificare**: questa logica regge se i vault demo crescono di dimensione?
  C'è un limite alla quantità di dati base64 in IndexedDB su iPad?

### B. Tracciare flusso: _assignHubGroup + dedupeNodesAsCrossLinks + translatePayload
Query graphify da eseguire nella prossima sessione:
`graphify query "Come sono collegati _assignHubGroup, dedupeNodesAsCrossLinks e translatePayload al flusso di generazione principale in app.js?"`
**Risposta attesa**: queste tre funzioni operano in sequenze separate —
- `translatePayload` (bridge) trasforma il payload Gemini → OpenAI prima della chiamata API
- `_assignHubGroup` (post-processing) assegna il gruppo colore a ogni nodo L2 dopo
  aver ricevuto la risposta AI
- `dedupeNodesAsCrossLinks` (post-processing) rimuove duplicati cross-ramo dopo
  la generazione multipass
Nessuna delle tre chiama le altre direttamente. Il collegamento passa per `fetchModelAPI`
→ risposta AI → `initD3Visualization`.

---

## 🔴 PRIORITÀ ALTA

### 1. Template `MIND_MAP_BRANCH_IT` — 4 regole mancanti (analisi 1 giugno)
**Origine**: analisi comparativa GEMMA vs MISTRAL sulla Guerra Fredda con `/analyze-mm`.
Graphify ha confermato che quasi tutti i problemi strutturali di MISTRAL sono prompt-addressable.

**Regole da aggiungere in `MIND_MAP_BRANCH_IT` e `MIND_MAP_BRANCH_INFOMANIAK_IT`:**

1. **Anti-date nei label**: *"Non includere date nei label dei nodi — le date vanno nel
   campo 'content' (max 10 parole), mai nel label stesso"*
2. **Anti-lista nei label**: *"Un label non deve mai contenere elenchi di nomi separati
   da virgole — se ci sono più elementi, crea nodi figli separati"*
3. **Anti-duplicato cross-ramo**: *"Verifica che ogni concetto NON sia già presente come
   label in un'altra macro-area — se esiste un concetto simile altrove, crea un link,
   non un nuovo nodo"*
4. **Concetti pivotali a L2**: *"Se un concetto è menzionato nella macro-area con ruolo
   centrale (es. un piano, un trattato, un evento scatenante), posizionalo a Livello 2,
   non a L3 o L4"*

**Cap nodi per Infomaniak già presente ma da rafforzare**: aggiungere anche nel template
standard (non solo Infomaniak): `"Genera MASSIMO 35 nodi totali per questa mappa"`

**File da modificare**: `prompts_config.json` e `public/prompts_default.json`
**Note**: queste 4 regole avrebbero eliminato ~15 dei problemi rilevati in MISTRAL.

### 2. Nuovo template `MIND_MAP_BRANCH_IT` profilo Liceo (Mistral-optimized)
**Origine**: analisi ha mostrato che Mistral Small ha potenziale per profili Liceo
(profondità L5, copertura più ampia, 200K context) ma serve un template dedicato.

**Da creare**: `MIND_MAP_BRANCH_LICEO_IT` e `MIND_MAP_BRANCH_LICEO_EN` con:
- Cap 40 nodi (più generoso del 35 per 4a Media)
- Profondità L5 esplicitamente incoraggiata per concetti tecnici/scientifici
- Regola link di contrappeso: *"Se il concetto ha un OPPOSTO diretto nel documento
  (es. NATO/Patto Varsavia, Capitalismo/Socialismo), inserisci un link con rel
  'si contrappone a'"*
- Regola causa-effetto: *"Per ogni evento che causa un altro, crea un link con rel
  'causa' o 'porta a'"*
- Regola simmetria bipolare (per storia): *"Per documenti che descrivono contrapposizioni,
  crea nodi simmetrici per ciascun lato (es. 'Blocco Occidentale' e 'Blocco Orientale'
  come nodi distinti con link 'si contrappone a')"*

**Logica di selezione**: il template viene scelto in base al profilo allievo
(`userProfile.grade` contiene "Liceo").

### 3. Chunking map-reduce Fase 1 MM (lost-in-the-middle)
**Problema**: il documento viene passato **intero** in ogni chiamata AI (Fase 1 L1
e ogni ramo Fase 3). Per Infomaniak con context 65K-100K questo causa overflow o
perdita di contenuto. Per Google (1M+ context) non urgente.
**Chiarito in sessione**: il lost-in-the-middle NON è la causa dei label L1 lunghi
(quello era un problema di prompt con lenses). Il chunking serve solo per Infomaniak.
**Piano concordato**:
- Helper `window.chunkText(text, dimChunk, overlap)` — blocchi ~12K token (~48K char)
  con overlap ~12% ai confini di paragrafo
- Fase 1 L1: loop su chunk → estrai macro-aree per ogni chunk → deduplica → unisci
- Fase 3 rami: mini-retrieval — ogni ramo riceve solo i chunk rilevanti (match keyword)
- **Solo per Infomaniak**: Google Gemini non ne ha bisogno

### 4. Verifica fix prompts_config.json in userData
**Problema**: la copia in `userData` sovrascrive i fix del repo se l'utente ha
personalizzato i prompt in precedenza.
- Rigenerare KG → verificare ≥2 link per nodo L2
- Rigenerare MM con lenses → verificare label L1 brevi (fix A+B di questa sessione)
- Se ancora lunghi → Admin Prompts → "Ripristina Default"

---

## 🟠 PRIORITÀ MEDIA

### 5. Testare Kimi-K2.6 (256K context)
- Generare MM e KG con Kimi-K2.6
- Verificare che `json_schema` funzioni
- Se funziona: aggiornarlo come alternativa a Gemma 4 per doc molto lunghi

### 6. Aggiungere `dedupeNodesAsCrossLinks` al MM single-pass
Attualmente solo nel multipass HD. Punto di inserimento: prima di `initD3Visualization`
in `extractMindMapIterative`.

### 7. Avviso UI per Apertus in modalità KG
Warning quando utente seleziona Apertus con KG attivo. Punto: `window.setMode`
o `window.fetchModelAPI` con provider=infomaniak, modello=apertus, mode=kg.

### 8. Verifica visiva label con date sui nodi
Date badge rimosso, ora data+nome sono nello stesso tspan. Verificare:
- Centramento verticale corretto per vari livelli di nodo
- `DATE_GAP = 1.5em` è sufficiente come spazio tra data e nome?
- Nodi con data a L4/L5 (cerchio piccolo) non risultano compressi?

---

---

## 🟡 PRIORITÀ BASSA / BACKLOG

### 9. Investigare anomalia token KG GEMMA con lenti attive (37K vs 65K)
**Sintomo**: KG GEMMA LENTI 4aMEDIA → 37K token prompt, solo 13 nodi generati.
Senza lenti → 65K token, 34 nodi. Le lenti dovrebbero aumentare il prompt, non dimezzarlo.
**Causa ipotizzata**: con `focusTopic` non vuoto, qualcosa in `extractKnowledgeGraphSinglePass`
tronca il testo sorgente.
**Punto di ingresso**: `extractKnowledgeGraphSinglePass` in `app.js`, confronta payload
con `focusTopic` vuoto vs non vuoto.

### 10. Validazione post-gen nodi vuoti
MISTRAL genera occasionalmente nodi con body vuoto (es. "1947 Effetti Piano Marshall" a L3).
**Fix**: dopo parsing risposta AI, scartare nodi con `desc` e `content` < 5 parole.
Segnalare con warning toast.

### 11. Dedup cross-ramo: test su mappa reale
Validare `dedupeNodesAsCrossLinks` su più mappe reali — la regex conservativa
(singolare/plurale, sort parole) è progettata per essere sicura ma non testata
estensivamente.

### 12. Pulizia log diagnostici temporanei
Solo warning utili da tenere: `[Infomaniak] Stream VUOTO` e `[MappAI] Rimossi N nodi garbage`.

### 13. Refactoring CSS (703 `!important`)
Guerra di specificità con Tailwind. Non urgente ma degrada la manutenibilità.

### 14. Decomposizione `app.js`
~13.000+ righe. Candidati a separazione: funzioni KG, MM, D3, vault, UI landing.

### 15. Pulizia root progetto
~20 script Python e file `.bak` nella root. Non toccare ora.

---

## ✅ COMPLETATO IN QUESTA SESSIONE (1 giugno 2026)

### Analisi comparativa MM/KG — Google vs Infomaniak
- Analisi strutturale e semantica di 16 vault (8 Google, 8 Infomaniak) su documento
  "L'Albero come Sistema Vivente" — profilo 4a Media, con e senza lenti, 4 modelli
- Strumento: skill `/analyze-mm` + pipeline graphify per confronto semantico
- **Finding principale**: le lenti funzionano bene per MM (label L1 più precisi)
  ma creano KG sparsi perché aggiungono nodi niche senza generare cross-link

### Fix `L1_MACRO_CATEGORIES_IT` e `_EN` — regola domain-specific
- Aggiunta regola: label devono essere SPECIFICI DEL DOMINIO (non generici)
- Esempi espliciti nel template: "Trasporto Vascolare" non "Sistemi di Trasporto"
- Aggiunto `{{focusTopic}}` al template EN che ne era privo (lenti non funzionavano in EN)
- **Causa risolta**: Mistral Small allucinava su "Sistemi di Trasporto" perché il label
  era ambiguo — il modello espandeva il ramo in senso letterale invece che botanico
- **File modificati**: `prompts_config.json` e `public/prompts_default.json`

### Analisi comparativa MM Guerra Fredda — GEMMA vs MISTRAL con lenti
- Vault analizzati: "MM GF GEMMA LENTI e 4 NODI MANUALI - 4aMEDIA" vs "MM GF MISTRAL LENTI 4aMEDIA"
- Graphify ha identificato 7 cluster semantici naturali vs struttura generata da MappAI
- **GEMMA**: produzione superiore per 4a Media (100% fonti, label puliti, nessun duplicato)
- **MISTRAL**: problemi di frammentazione e label lunghi — tutti prompt-addressable
  - 4 regole mancanti identificate (anti-date, anti-lista, anti-duplicato, pivotali a L2)
  - Potenziale superiore per profili Liceo (profondità L5, 200K context)
- **Concetti mancanti identificati**: Dottrina Truman, Comecon, Maccartismo, Détente
- **God nodes identificati da graphify**: Piano Marshall (deg.7), Stati Satelliti (deg.7),
  Conflitti Locali (deg.6) — nessuno dei tre posizionato correttamente in nessuna MM

### Skill `/analyze-mm` creata
- File: `~/.claude/skills/analyze-mm/SKILL.md`
- Pipeline: lettura vault → graphify re-analisi contenuto → confronto strutturale → report
- Due modalità: analisi singola (auto-detect vault) + analisi comparativa (2 vault)
- Output: sezione tecnica (metriche + anomalie + raccomandazioni template) +
  sezione didattica (valutazione pedagogica per docente/OPI)
- Registrata in `~/.claude/CLAUDE.md` per disponibilità in tutte le sessioni

### Valutazione modelli Infomaniak per MM/KG
| Modello | MM qualità | KG qualità | Raccomandazione |
|---------|-----------|-----------|-----------------|
| Gemma-4 31B | ✅ Buona | ⚠️ Scarsa (density ~1.1) | Baseline per 4a Media |
| Mistral Small 119B | ⚠️ Troppi nodi, fix needed | ⚠️ Scarsa (density ~1.2) | Potenziale per Liceo |
| Ministral 3B | ⚠️ Troppi nodi | 🔴 7-13 nodi (troppo piccolo) | Non adatto per KG |

---

## ✅ COMPLETATO IN SESSIONE PRECEDENTE (31 maggio 2026, pomeriggio)

### Extraction Lenses — KG
- Fix critico: lenses non arrivavano ai prompt KG (né single-pass né multipass)
- `focusTopic` aggiunto a `extractKnowledgeGraphSinglePass` (fillPromptTemplate)
- `focusInjection` aggiunto a KG multipass Fase 1 e Fase 3
- Template `KNOWLEDGE_GRAPH_SINGLE_IT/EN/STUDENT_IT/EN` aggiornati con `{{focusTopic}}`
- Template `L1_MACRO_CATEGORIES_IT/EN` e `MIND_MAP_BRANCH_IT` allineati in prompts_config.json

### Extraction Lenses — Lens "date"
- Lens `dates` riscritta: da "crea nodi dedicati per date" a "incorpora data nel label evento"
  (es. "1968 Primavera di Praga"). Compatibile con `extractDateFromLabel` e date badge.
- Lens "Cronologia" eliminata (ridondante con la lens date riscritta)

### Fix labeling L1 con lenses attive (Fix A + B)
- **Fix A** (`cleanLabel`): rimuove liste enumerate tra parentesi dai label
  (pattern `(item1, item2, ...)` con virgole) — artefatto AI su macro-categorie L1
- **Fix B** (template `L1_MACRO_CATEGORIES_IT/EN`): guard esplicito che vieta liste
  tra parentesi nei label L1 e limita le istruzioni lenses ai nodi figli

### Autofill nome fonte → hub
- `handleSourceAutofill` disabilitato: caricare un PDF non aggiunge più il nome file
  come hub automatico

### UI — "Fissa Layout"
- "Salva Layout Snapshot" rimosso dal toolbar, spostato nel menu click-destro
  sull'area vuota come "Fissa Layout" (icona puntina)
- Il vecchio "Fissa Layout" (che apriva modal) sostituito da `salvaLayout()` diretto

### Nodi — label data+nome
- Date badge separato (Space Mono bianco fuori cerchio) rimosso
- Data e nome ora in un unico `text.node-text` come due tspan consecutivi:
  `[DATA]` (prima riga) + `[NOME]` (righe sotto), stesso stile, gap `1.5em`
- Centramento verticale del blocco data+nome corretto

### Fisica simulazione — bug fix
- `dragstarted`: non riscalda più la simulazione se `isPinned` o `!attractionEnabled`
- `dragended` (tap senza movimento): rispetta stato pin invece di liberare fx/fy
- `applyPinning(true)`: azzera `collide` force e non uccide la simulazione
  (lascia `alpha(0.05)` per tick visivi durante drag)
- Drag logic semplificata: regola unica `releaseToPhysics = attractionEnabled && !isPinned`,
  nessuna distinzione di livello tranne L0 (sempre al centro con fisica attiva)

### Layout iniziale grafi
- **MM (1+3)**: pre-posizionamento gerarchico radiale — root centro, ogni livello su
  cerchio concentrico, ogni ramo nel suo settore angolare proporzionale
- **KG (1+2)**: hub in cerchio, L2 vicini al loro hub primario; cluster force persistente
  che attrae ogni nodo verso il centroide del suo hub (`α * 0.12`)
- Forza radiale MM ridotta a `strength(0.15)` (era 0.3)

### Dimensione nodi per degree
- MM: `base + degRatio * (base * 0.5)` — fino a +50% sul raggio base per nodi molto connessi
- KG L1: 28–50px (era 30–40px); KG L2+: 12–30px (era 12–22px)

### Hub color — influenza pesata BFS
- Sostituisce il calcolo flat `hubColors` (Set di colori diretti) con BFS pesato 3 hop:
  diretto=1.0, 1-hop=0.5, 2-hop=0.25
- Archi proporzionali al peso normalizzato (angolo + spessore scalano col peso)

### Treeview — doppio click
- Doppio click su item treeview ora apre `handleNodeClick` (pannello dettagli nodo)
  invece di `openEditModal` (modal di editing)

## ✅ COMPLETATO IN SESSIONE PRECEDENTE (30-31 maggio 2026, mattina)

- Fix circular JSON error in `main.js`
- Fix `frequency_penalty` e `presence_penalty` nel bridge Infomaniak
- Fix `json_schema` per Gemma 4, esclusione Qwen e Apertus
- Fix Qwen thinking (`chat_template_kwargs`)
- Rewrite `salvageTruncatedJSON` con `_extractBalancedJSON`
- `cleanLabel`: apostrofo tipografico, markdown, word-wrap, no truncation
- `normalizeId`: sanifica markdown dagli ID
- Pulizia nodi garbage (DUMMY, level negativo)
- `_assignHubGroup` con voto a 2 hop
- Multi-link prompt nei template KG
- `focusInjection` in Fase 3 MM multipass (lenses nei rami profondi)
- `dedupeNodesAsCrossLinks` (approccio B conservativo)
- Timeline: pass 2 AI per date mancanti + regex safety net
- `extractDateFromLabel` helper
- Recent projects bar: card più piccole, word-wrap titoli
- `rootNodeLabel` fallback per KG vuoto
- Context window corretti per modelli Infomaniak
- Auto-selezione modello al cambio MM→KG
