# TODO.md — MappAI Prossima Sessione
> Priorità in ordine decrescente. Aggiornato: 31 maggio 2026 (sessione pomeriggio).

---

## 🔴 PRIORITÀ ALTA

### 1. Chunking map-reduce Fase 1 MM (lost-in-the-middle)
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

### 2. Verifica fix prompts_config.json in userData
**Problema**: la copia in `userData` sovrascrive i fix del repo se l'utente ha
personalizzato i prompt in precedenza.
- Rigenerare KG → verificare ≥2 link per nodo L2
- Rigenerare MM con lenses → verificare label L1 brevi (fix A+B di questa sessione)
- Se ancora lunghi → Admin Prompts → "Ripristina Default"

---

## 🟠 PRIORITÀ MEDIA

### 3. Testare Kimi-K2.6 (256K context)
- Generare MM e KG con Kimi-K2.6
- Verificare che `json_schema` funzioni
- Se funziona: aggiornarlo come alternativa a Gemma 4 per doc molto lunghi

### 4. Aggiungere `dedupeNodesAsCrossLinks` al MM single-pass
Attualmente solo nel multipass HD. Punto di inserimento: prima di `initD3Visualization`
in `extractMindMapIterative`.

### 5. Avviso UI per Apertus in modalità KG
Warning quando utente seleziona Apertus con KG attivo. Punto: `window.setMode`
o `window.fetchModelAPI` con provider=infomaniak, modello=apertus, mode=kg.

### 6. Verifica visiva label con date sui nodi
Date badge rimosso, ora data+nome sono nello stesso tspan. Verificare:
- Centramento verticale corretto per vari livelli di nodo
- `DATE_GAP = 1.5em` è sufficiente come spazio tra data e nome?
- Nodi con data a L4/L5 (cerchio piccolo) non risultano compressi?

---

## 🟡 PRIORITÀ BASSA / BACKLOG

### 7. Dedup cross-ramo: test su mappa reale
Validare `dedupeNodesAsCrossLinks` su più mappe reali — la regex conservativa
(singolare/plurale, sort parole) è progettata per essere sicura ma non testata
estensivamente.

### 8. Pulizia log diagnostici temporanei
Solo warning utili da tenere: `[Infomaniak] Stream VUOTO` e `[MappAI] Rimossi N nodi garbage`.

### 9. Refactoring CSS (703 `!important`)
Guerra di specificità con Tailwind. Non urgente ma degrada la manutenibilità.

### 10. Decomposizione `app.js`
~13.000+ righe. Candidati a separazione: funzioni KG, MM, D3, vault, UI landing.

### 11. Pulizia root progetto
~20 script Python e file `.bak` nella root. Non toccare ora.

---

## ✅ COMPLETATO IN QUESTA SESSIONE (31 maggio 2026, pomeriggio)

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
