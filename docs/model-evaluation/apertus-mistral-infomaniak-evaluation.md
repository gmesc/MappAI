# Valutazione modelli Infomaniak per MappAI — Apertus 70B e Mistral Small 119B

> Archivio di conoscenza su problemi, limiti, fix e benchmark dei modelli AI
> Infomaniak usati da MappAI per la generazione di MindMap (MM) e Knowledge
> Graph (KG). Periodo: 4-9 giugno 2026, branch `feat/structural-suggestions`.
> Lavoro sospeso in attesa di riprenderlo più avanti — questo documento serve
> a non perdere le conoscenze acquisite su errori e limiti dei modelli.

## Contesto: provider Infomaniak

MappAI supporta Infomaniak come provider AI alternativo a Google Gemini
(scelto per motivi GDPR / dati educativi svizzeri). La chiamata passa per
`window.InfomaniakBridge.translatePayload`, che converte il payload formato
Gemini in formato OpenAI-compatible.

Quirk noti del bridge, validi per TUTTI i modelli Infomaniak:
- `responseMimeType: "application/json"` NON è supportato nativamente — il
  bridge lo converte in un reminder testuale iniettato nel prompt, che altera
  il contesto e riduce l'aderenza al JSON richiesto.
- `responseSchema` causava risposta vuota (0 caratteri) su Kimi-K2.6 — bug
  risolto il 4 giugno 2026. Su Apertus e Mistral non veniva comunque usato
  (NO function calling per Apertus).
- `temperature` è hardcoded a 0.3 nel bridge, ignora il valore del payload.
- Streaming SSE obbligatorio per bypassare i Gateway Timeout.
- `salvageTruncatedJSON()` con pre-pulizia (markdown fences, chiavi non
  quotate, virgole trailing) è la difesa generale contro JSON malformato di
  questi modelli — mai `JSON.parse` diretto su risposte Infomaniak.

Modelli Infomaniak valutati (vedi tabella riassuntiva in `CLAUDE.md` §7):

| Modello | Profilo ottimale | MM | KG | Stato |
|---|---|---|---|---|
| Gemma-4 31B | 4a Media, BES/DSA, scienze | ✅ | ⚠️ | Baseline stabile |
| Mistral Small 119B | Liceo, storia, doc lunghi | ⚠️ | ⚠️ | Inadatto a benchmark ripetibili |
| Kimi-K2.6 | Corpus lunghi, alta qualità | 🔬 in test | 🔬 | Bug responseSchema risolto, test pipeline completo da fare |
| Apertus 70B | MM semplici (4a Media, BES/DSA) | ✅ | ❌ | **PROMOSSO 5/6/2026** |

---

## Apertus 70B — modello svizzero (ETH/EPFL)

**Stato finale: PROMOSSO ✅ (5 giugno 2026)**, consigliabile come default
Infomaniak per BES/DSA: costo bassissimo (~0.008 CHF/run), JSONL
sintatticamente pulitissimo. NO function calling → nessun KG possibile,
solo MindMap.

### Diagnosi qualità output

Apertus produce **JSONL sintatticamente pulito** (zero nodi malformati),
a differenza di Mistral. Le sue uniche "righe scartate" sono prosa verbosa
(`**Nota:**`, `Questo output rispetta...`) e placeholder per le foglie
(`target:null`, `target:"L5"`) — non JSON rotto. È il modello Infomaniak
**più disciplinato sul formato** tra quelli testati.

### Run iniziale (4/6/2026) — risultato fuorviante

Report finale: 22 nodi, 2 link, densità 0.091, zero L2 su tutti i rami.

**Questo report era falsato da un bug dell'app, NON da Apertus.** Il
comportamento JSONL di Apertus per ramo era in realtà sano:
- "Neutralità e Difesa": 7 nodi, 6 link — integro
- "Commissione Storica (Bergier)": 5 nodi, 4 link — integro
- "Economia di Guerra": 7 nodi, 5 link (0 nodi persi, 18 link persi)
- "Accoglienza dei Profughi": 7 nodi, 3 link (0 nodi persi, 23 link persi)
- "Relazioni Internazionali": 6 nodi, 4 link (0 nodi persi, 12 link persi)

**Causa del crollo a 22 nodi:** crash `TypeError: Cannot read properties of
undefined (reading 'selectAll')` in `tick()` (`app.js` ~L.6326). Phase4
chiamava `executeMerge()` → `renderGraph()` → nuova simulation D3 →
`simulation.tick(300)` sincrono → `tick()` con `g` ancora `undefined` perché
`initD3Visualization()` non era stata eseguita (viene chiamata solo a fine
generazione via `setTimeout`). Il crash troncava la mappa a 22 nodi
superstiti e Phase4 perdeva 62 cross-link nel parser.

### I 5 fix applicati (in ordine, ognuno scoperto da un run successivo)

1. **Crash `tick()` con `g undefined`** — guard `if (!g) return;` aggiunta
   sia in `renderGraph` sia in `tick`. Era questo, e non Apertus, a
   distruggere la mappa.
2. **Anti-duplicati L2 cross-ramo** — `buildSiblingL1Catalog(branchId,
   completedL2s)` passa al prompt del ramo corrente i label L2 dei rami già
   generati con la regola "NON ricreare". Tracking via `completedBranchL2s`
   aggiornato dopo ogni ramo.
3. **Ghost-link sulle foglie** — Apertus usa `target:"L5"` / `target:null` /
   `target` con `*` o "non specificato" come placeholder per le foglie.
   `parseJSONLResponse` ora scarta questi link (regex `/^L\d+$/` e simili).
   Riduceva i link persi da 94 a ~1 sul ramo peggiore.
4. **`parsed.merges is not iterable`** — guard `(parsed.merges || [])` /
   `(parsed.crosslinks || [])` in Phase4. Apertus a volte risponde senza
   header `===MERGES===`, il fallback parser non aveva quelle chiavi.
5. **Crosslink verso nodi fusi** — `report._dropToKeep` (Map drop→keep dei
   merge realmente applicati) + `resolveId` che segue la chain. Prima i
   crosslink di Phase4 venivano tutti skippati perché puntavano a ID fusi.
   Bonus: fix self-loop in Fase 3 (`realMatch` escludeva il nodo L1 del ramo
   stesso → il ramo non veniva più svuotato).

### Esito finale — 6 run iterativi (5/6/2026 sera)

Da inutilizzabile (22 nodi, 0 L2, densità 0.09 per crash) a stabile e
funzionale: **20-25 nodi, densità ~1.4, topology networked, crossLinks
applicati, sourceCov 75-80%, costo ~0.008 CHF/run**.

### Limite residuo (strutturale al modello 70B)

Rami poco profondi: Apertus genera concetti "ovvi" del topic invece di
differenziare per ramo. Adatto a topic semplici (4a Media, BES/DSA). Per
argomenti complessi servono Kimi-K2.6 o Qwen.

### REGOLA CRITICA — Apertus NON regge few-shot JSON in-context (7/6/2026)

**Tentativo fallito:** iniettare 2 nodi della mappa Gemini WWII (61 nodi,
density 1.02, qualità label/content ottima) come exemplar nel prompt JSONL,
per calibrare lo stile di label/content di Apertus.

**Risultato: backfire completo su tutti i fronti.**

> Qualsiasi oggetto JSON nel prompt JSONL viene trattato da Apertus come
> contenuto da generare, non come modello di formato — indipendentemente dal
> testo esplicativo che lo precede. Questa regola vale per sempre: mai usare
> esempi strutturati JSON dentro un prompt JSONL per Apertus.

Danni concreti osservati:
- Exemplar `{"id":"ES_L3","label":"Ridotto Nazionale",...}` → generato come
  nodo reale nel ramo sbagliato ("Accoglienza Profughi").
- Placeholder Phase4 `{"source":"ID_COMMERCIO_ORO",...}` → usati come target
  reali → 0 cross-link applicati su 4 recuperati.
- Prosa esplicativa adiacente al JSONL → Apertus impara che può commentare
  inline → 90 nodi / 38 link persi nel ramo "Economia e Commercio".

**Cosa tenere comunque dalla sessione (non dannoso):**
- Desc richiesta estesa 30-50 → 50-80 parole con obbligo di dati specifici
  (`buildBranchPromptJSONL`) — nessun danno, migliora la densità informativa.
- Vocabolario `rel` arricchito in Phase4 (smaschera, condanna, contraddice,
  rafforza, giustifica, è condizione di, è conseguenza di, legittima,
  alimenta) + avviso "usa solo ID reali".

**Alternativa valida per calibrare Apertus:** descrivere le qualità
richieste in linguaggio naturale, mai con esempi JSON strutturati.

### Nuovo obiettivo emerso (8/6/2026) — non ancora implementato

Mappe tree-like con coerenza semantica interna eccellente: ogni ramo
semanticamente coerente e profondo (L3-L4 reali, desc dense). I cross-link
sono ammessi SOLO come conseguenza di un MERGE di Phase4 (nodo duplicato fuso
verso la macro-area più pertinente diventa l'unico cross-link ammesso).
Nessun cross-link sintetico generato solo per aumentare la density — la
density NON è un indicatore di qualità per BES/DSA: un albero pulito con
desc dense è più utile pedagogicamente di un grafo con cross-link inventati.
Implicazione pratica da valutare: disabilitare la sezione CROSSLINKS in
Phase4, lasciando solo MERGES (modalità "solo-MERGES" — esperimento futuro).

---

## Mistral Small 119B

**Stato: ⚠️ inadatto a benchmark ripetibili, non adatto come modello
principale per utenti.** Profilo teorico migliore: Liceo, storia, documenti
lunghi (profondità L5, 200K context).

### Benchmark — 6 run (4/6/2026, topic "Svizzera", tutti i flag ON)

| Run | nodi | densità | crossLink% | sourceCov | L1 count | Note |
|---|---|---|---|---|---|---|
| 1 | 40 | 1.025 | 2.4% | 62.5% | 5 | 2 rami vuoti (0 nodi recuperati) |
| 2 | 58 | 1.00 | 1.7% | 48.3% | 5 | Ramo vuoto "Politica Asilo" — 233 nodi persi |
| 3 | 48 | 1.021 | 0% | 75.0% | 4 | Nessun crosslink rilevato |
| 4 | 61 | 1.00 | 3.3% | 75.4% | 5 | Stabile ma ID lunghissimi (`L1_4_L5_B2bA1...`) |
| 5 | 50 | 1.04 | 5.8% | 58.0% | 4 | Link con spazi nelle chiavi |
| 6 | 63 | 1.063 | 4.5% | 79.4% | 5 | Run migliore; 1 ramo vuoto (19 nodi persi) |

### Diagnosi

Problema strutturale nel JSON prodotto: chiavi con spazi (`"id "`),
double-escape annidato (`{\"id\":\"X\"}`), oggetti spezzati su più righe,
campi rinominati a caso (`labcl`, `Ll_0`). I rami in coda alla generazione
perdono tra 0 e 233 nodi. Alta variabilità tra run a parità di documento e
configurazione (crossRatio osservato tra 8% e 21% a seconda del run). `generic:
0%` su tutti i run — le 4 regole anti-label (regole 11-14 aggiunte a
`MIND_MAP_BRANCH_IT`) tengono.

**Why:** il modello degrada progressivamente man mano che genera i rami
successivi, probabilmente per limiti di context window o per la modalità di
generazione streamed.

### Fix tentati (parziali)

- 4 regole anti-label aggiunte a `MIND_MAP_BRANCH_IT` (regole 11-14) — hanno
  funzionato (`generic: 0%`).
- `maxOutputTokens` 3000→8192 per ridurre i troncamenti di Fase 3.
- Il parser JSONL recupera parte degli errori ma su rami profondi perde
  ancora ~30% dei nodi — **problema strutturale irrisolto**, non risolvibile
  lato app.

### How to apply

Non usare Mistral Small 119B per benchmark ripetibili né come modello
principale. Se si riprende il lavoro su questo modello, il problema da
risolvere è a monte (qualità del JSON generato), non nel parser — già
ottimizzato al limite del recuperabile.

---

## Gemma-4 31B (per confronto — baseline)

**Stato: ✅ MM stabile, ⚠️ KG.** Profilo: 4a Media, BES/DSA, scienze. Label
puliti, baseline affidabile.

**Anomalia KG con lenti aperta (da investigare):** `extractKnowledgeGraphSinglePass`
con `focusTopic` non vuoto produce KG da soli 13 nodi e ~37K token (atteso
~65K) — possibile troncamento del testo sorgente quando il focus è popolato.
Vedere TODO backlog punto 10.

**Causa C (Infomaniak) — KG povero, aperta:** a parità di template che su
Google porta densità 1.09→2.0 e generiche 68%→0%, Gemma su Infomaniak arriva
solo a densità 1.31 con 36% relazioni generiche. Causa probabile: il bridge
converte `responseMimeType:"application/json"` in un reminder testuale,
quindi il modello aderisce solo a metà al prompt. Prossima azione proposta
(non implementata): rimuovere `responseMimeType`/`responseSchema` quando
`aiProvider==='infomaniak'`, affidando il parsing interamente a
`salvageTruncatedJSON`.

---

## Kimi-K2.6 (256K context) — non ancora testato a fondo

🔬 In test. Bug `responseSchema` → risposta vuota (0 caratteri) **risolto il
4 giugno 2026**. Test completo della pipeline MM/KG ancora da fare (TODO
priorità #2 in `CLAUDE.md` §11).

---

## Direzioni future / TODO collegati

- **Chunking map-reduce per Infomaniak** (TODO backlog §11) — beneficerebbe
  tutti i modelli Infomaniak, non solo Apertus/Mistral.
- **Riarchitettura Fase 3 a cascata** (vedi memoria
  `project_chunks_extrapass`) — diagnosi dal vault APERTUS 6 (L1 vuoti, chunks
  che divorano budget, caos ID). STEP 1 = arricchire desc L1.
- **Phase4 "solo-MERGES"** (no sezione CROSSLINKS) — esperimento per
  l'obiettivo "mappe tree-like con coerenza semantica interna" (8/6/2026).
- Se si riprende il lavoro su Mistral Small, il problema del JSON malformato
  va affrontato lato prompt/modello, non lato parser.
- Se si riprende il lavoro su Apertus per calibrazione di stile, usare SOLO
  linguaggio naturale — mai esempi JSON in-context.
