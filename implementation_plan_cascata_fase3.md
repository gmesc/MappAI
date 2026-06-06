# Riarchitettura Fase 3 — Cascata a fasce di livello + L1 charter + chunks extra-pass

> Spec operativa per la nuova generazione MindMap (Infomaniak + Google).
> Riferimenti: `TODO.md` §6 · memoria `project_chunks_extrapass.md` · vault diagnostico "APERTUS 6".
> Autore note: Giacomo Meschini — Documento di progettazione, 6 giugno 2026.

---

## 0. Perché cambiamo (in una frase)

Oggi generiamo **un ramo intero per chiamata** (depth-first). Il modello satura la
memoria, riusa gli stessi ID in ogni ramo, droppa link e duplica nodi. Le mappe escono
povere: nodi doppi, rami senza interlink, sconfinamenti.

La cura: **generare a fasce di livello** (breadth-first). Ogni chiamata produce
**solo i figli diretti di un nodo** — input piccolo, niente saturazione, niente
collisioni di ID. La descrizione ricca del padre, iniettata nel prompt del figlio,
elimina i doppioni **alla radice**.

### I tre difetti diagnosticati (evidenze, non ipotesi)
1. **L1 = gusci vuoti** — la desc L1 nel vault è letteralmente `Categoria principale: {label}`.
   Zero contenuto per guidare gli L2 → il modello indovina e sconfina.
2. **Le citazioni divorano il budget** — i log mostrano prosa che giustifica i chunks
   invece dei link. Su 8 nodi → 3 link → 5 orfani ripuliti → rami poveri.
3. **Depth-first = caos di ID** — riuso di `L3_A1`, `L4_A1A`, `L5_1` in ogni ramo →
   collisioni. `links.json` mostra `L1_1 → L1_0` (ramo include ramo) e figli agganciati
   ad altri rami. 4 doppioni confermati.

---

## 1. Vista d'insieme della pipeline a cascata

Ogni passo riceve **come contesto la descrizione ricca del nodo padre** (e dei
fratelli del padre) e restituisce **solo label + desc + ordine** dei figli diretti.
Gli **ID li assegna l'app**, non il modello.

```
                  DOCUMENTO + TOPIC
                         │
   ┌─────────────────────▼─────────────────────┐
   │  PASS A — MACRO-AREE (L1) + CARTA DEL RAMO │   1 chiamata
   │  label + desc 40-60 parole + confini       │
   └─────────────────────┬─────────────────────┘
                         │   (desc L1 + confini → contesto)
   ┌─────────────────────▼─────────────────────┐
   │  PASS B — L1 ▶ L2  (per ogni L1)           │   N chiamate (1 per L1)
   │  figli diretti di ciascun L1               │
   └─────────────────────┬─────────────────────┘
                         │   (desc L2 + desc L1 padre → contesto)
   ┌─────────────────────▼─────────────────────┐
   │  PASS C — L2 ▶ L3  (per ogni L2)           │   M chiamate (1 per L2)
   └─────────────────────┬─────────────────────┘
                         │
   ┌─────────────────────▼─────────────────────┐
   │  PASS D — L3 ▶ L4  (per ogni L3)           │   opz. (cap profondità)
   └─────────────────────┬─────────────────────┘
                         │
   ┌─────────────────────▼─────────────────────┐
   │  PASS E — L4 ▶ L5  (per ogni L4)           │   opz. (di norma OFF per BES/DSA)
   └─────────────────────┬─────────────────────┘
                         │   (struttura COMPLETA, senza citazioni)
   ┌─────────────────────▼─────────────────────┐
   │  PASS F — CHUNKS VERBATIM (extra-pass)     │   1+ chiamate
   │  documento + nodi finali → solo citazioni  │
   └─────────────────────┬─────────────────────┘
                         ▼
              MAPPA COMPLETA + CITAZIONI
```

**Principio cardine:** ogni nodo di livello `N` viene generato a partire **solo** dalla
desc del suo genitore `N-1` (più, per i livelli alti, la desc del nonno per ancorare il
contesto). Niente "ramo intero in una botta".

---

## 2. I PASS in dettaglio

### PASS A — Macro-aree L1 + "Carta del Ramo" (charter)
**Cosa genera:** l'elenco degli L1, ognuno con una **descrizione ricca** e i **confini**.

- **Input:** documento (o suoi estratti) + topic/`rootNodeLabel` + profilo studente.
- **Output per L1:**
  - `label` — titolo della macro-area (max ~3 parole)
  - `desc` — **40-60 parole**: cosa copre il ramo, perché esiste, quali concetti chiave
    ci stanno dentro (è la "carta costituzionale" del ramo)
  - `confini` — **cosa NON va in questo ramo** (1-2 frasi): i temi che appartengono ad
    altri L1. È questo campo a prevenire lo sconfinamento.
- **Dove tocca il codice:** template `L1_MACRO_CATEGORIES` (Fase 2, `app.js` ~3032 /
  ~2582). Esiste già il campo `ambito` (keyword di perimetro): va **esteso** a desc
  narrativa completa + nuovo campo `confini`.
- **Perché è il primo step:** alto impatto, basso costo. Da solo, iniettato nel prompt
  della Fase 3 attuale, dovrebbe già ridurre i doppioni. → **STEP 1 dell'implementazione.**

> Esempio di carta L1 (storia):
> `label`: "Economia di guerra"
> `desc`: "Misure con cui la Svizzera adattò la produzione e i consumi al conflitto:
> razionamento, Piano Wahlen, mobilitazione del lavoro, autarchia alimentare e
> dipendenza dalle importazioni di carbone e materie prime."
> `confini`: "NON include la difesa militare (Ridotto nazionale) né la politica
> dei profughi: quelli sono altri rami."

---

### PASS B — L1 ▶ L2 (una chiamata per ogni L1)
**Cosa genera:** i figli diretti di **un singolo** L1.

- **Input (contesto):** desc + confini dell'L1 padre **+ le carte (label+desc) di tutti
  gli L1 fratelli**. I fratelli servono al modello per sapere "dove finisce questo ramo
  e comincia quello accanto" → niente sconfinamento, niente concetti ripetuti tra rami.
- **Output per L2:** `label` + `desc` **30-40 parole** + `ordine`. **Nessun ID, nessun
  link, nessun chunk** (li gestisce l'app / il Pass F).
- **ID assegnati dall'app:** quando inserisce i figli, l'app genera
  `{parentId}_L2_A`, `_B`, … in modo deterministico, e crea il link
  `{L1} → {L2}` con `rel: "include"`. Il modello non vede mai gli ID → impossibile la
  collisione.

---

### PASS C — L2 ▶ L3 (una chiamata per ogni L2)
Identico a B, un livello più in basso.

- **Input (contesto):** desc dell'L2 padre + desc dell'L1 nonno (per ancorare il
  ramo) + opz. label dei fratelli L2.
- **Output per L3:** `label` + `desc` + `ordine`.
- **ID/link:** l'app crea `{L2}_L3_A…` e il link `{L2} → {L3}`.

---

### PASS D — L3 ▶ L4 (una chiamata per ogni L3) — opzionale
Stessa meccanica. Attivabile in base al **cap di profondità**.

- **Input (contesto):** desc L3 padre + desc L2 nonno.
- **Output per L4:** `label` + `desc` (+ desc più corta, sono foglie quasi-terminali).

---

### PASS E — L4 ▶ L5 (una chiamata per ogni L4) — opzionale, default OFF
L'ultimo livello di dettaglio.

- **Default per BES/DSA: spento.** Mappe a L3-L4 sono più leggibili e meno costose.
  L5 si attiva solo per profili liceo / corpora ricchi.
- Stessa meccanica di D.

> **Nota sul cap di profondità:** Pass D ed E sono governati da un parametro
> `maxMapLevel` (già presente nel codice). Per BES/DSA → `maxMapLevel = 3` o `4`.
> Per liceo → fino a `5`. Questo controlla anche il costo (vedi §5).

---

### PASS F — Chunks verbatim (extra-pass citazioni)
**Cosa genera:** SOLO le citazioni letterali, **dopo** che tutta la struttura è pronta.

- **Perché separato:** mescolare "trova le citazioni" con "costruisci la struttura"
  fa sì che il modello spenda il budget in prosa giustificativa e dimentichi i link
  (difetto #2). Disaccoppiando, ogni compito ha il suo budget pulito.
- **Input:** documento **intero** + la lista dei nodi finali (`{id, label, desc}`).
- **Output per nodo:** `{ nodeId, chunks: [ "citazione integrale e verbatim…", … ] }`.
  1-2 citazioni reali per nodo, minimo 10-15 parole, copiate fedelmente dalla fonte.
- **Dove tocca il codice:**
  - Rimuovere `chunks` da `buildBranchPromptJSONL` (`app.js` ~4153, attualmente regola 2
    e schema includono `chunks`) e dalla variante JSON legacy → prompt struttura più
    leggero.
  - Nuova `window.buildChunkExtractionPrompt(nodes, fullText)` → ritorna una sezione
    `===CHUNKS===` con un oggetto per riga.
  - Riuso di `window.parseJSONLResponse` (`app.js` ~3972) esteso per la sezione custom.
  - Loop dopo l'ultimo pass strutturale → popola `appState.db.sourcesDict[nodeId]`
    (stesso formato già usato oggi: `{ title, source, text }`).
- **Anti-allucinazione:** se una citazione non è ritrovabile nel testo sorgente, va
  scartata (verifica substring lato app) → "zero citazioni inventate" è una metrica di
  successo.

---

## 3. Regola d'oro trasversale: gli ID li assegna l'app

In **tutti** i pass strutturali (B→E) il modello restituisce **solo contenuto**
(label, desc, ordine). L'app:
1. assegna l'ID deterministico `{parentId}_L{n}_{lettera}`;
2. crea il link `{parent} → {figlio}` con `rel: "include"`;
3. ricalcola `level` e `group` se serve (riusa gli helper di `mappai-node-merge.js`).

Questo **elimina alla radice** il caos di ID del depth-first (difetto #3) e rende
**superfluo** il "catalogo fratelli come pezza" introdotto in Branch Boundaries:
la separazione tra rami diventa strutturale, non più una raccomandazione testuale.

---

## 4. Implementazione incrementale (ordine impatto/costo)

| Step | Cosa | Flag | Stato |
|------|------|------|-------|
| **STEP 1** | Desc L1 ricche + `confini` (Pass A), iniettate nella Fase 3 attuale | — (parte del template) | da fare per primo |
| **STEP 2** | Chunks extra-pass (Pass F): togliere `chunks` dalla struttura, nuovo prompt citazioni | `mappai_chunks_extrapass_enabled` | dopo STEP 1 |
| **STEP 3** | Cascata breadth-first completa (Pass B→E) + ID deterministici lato app | `mappai_cascade_gen_enabled` | il pezzo grosso |

- I flag sono **componibili** e di **default OFF** → nessuna regressione per chi non
  li attiva. Comandi console: `MappAIMetrics.enableCascade()/disableCascade()` e
  `enableChunksExtrapass()/disableChunksExtrapass()`.
- **Misurare dopo ogni step.** STEP 1 da solo potrebbe già ridurre i doppioni: se è
  così, STEP 3 diventa meno urgente.

---

## 5. Costo e metriche di successo

**Costo chiamate (esempio 4 L1, ~8 L2):**
- Oggi: ~5 chiamate (1 L1 + 4 rami).
- Cascata fino a L3 + chunks: ~`1 (A) + 4 (B) + 8 (C) + 1 (F)` ≈ **14 chiamate**.
- Più lento e ~0.02 CHF vs 0.008 su Infomaniak. Su Google (1M context) trascurabile.
- **Mitigazioni:** chiamate piccole (poco token ciascuna); cap a L3-L4 per BES/DSA
  (Pass E off); eventuale batch di più nodi-fratelli in una chiamata se il modello regge.

**Metrica di successo (target):**
- **Zero nodi doppi.**
- `undeveloped_branch ≤ 1` (da `mappai-structure-analyzer.js`).
- `crossRatio` in aumento.
- Profondità media di ramo in aumento.
- `sourceCov%` stabile o migliore.
- **Zero citazioni inventate** (verifica substring nel Pass F).

**Benefici trasversali:** non solo Apertus — riduce la variabilità di Mistral e rende
finalmente utile Kimi-K2.6.

---

## 6. Riepilogo dei PASS in una tabella

| Pass | Genera | Contesto ricevuto | Output per nodo | Chiamate |
|------|--------|-------------------|-----------------|----------|
| **A** | L1 + carta del ramo | documento + topic | label + desc 40-60 parole + confini | 1 |
| **B** | L2 (per ogni L1) | desc L1 padre + carte L1 fratelli | label + desc 30-40 parole + ordine | 1 per L1 |
| **C** | L3 (per ogni L2) | desc L2 padre + desc L1 nonno | label + desc + ordine | 1 per L2 |
| **D** | L4 (per ogni L3) | desc L3 padre + desc L2 nonno | label + desc + ordine | 1 per L3 (opz.) |
| **E** | L5 (per ogni L4) | desc L4 padre | label + desc + ordine | 1 per L4 (opz., OFF default) |
| **F** | chunks verbatim | documento intero + nodi finali | `{nodeId, chunks:[…]}` | 1+ |
