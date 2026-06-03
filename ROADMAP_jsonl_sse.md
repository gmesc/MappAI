# Implementation Plan — JSONL su SSE per Infomaniak

> Autore del piano: Claude Code · Data: 3 giugno 2026
> Branch: `claude/infomaniak-jsonl-sse-plan-glEIO`
> Stato: **PROPOSTA** (nessuna modifica al codice ancora applicata)
> Riferimenti: CLAUDE.md §3, §8 (Causa C), §10 regole #5/#6 · `ROADMAP_graphify.md`

---

## 0. TL;DR

Oggi MappAI chiede ai modelli Infomaniak **un unico, gigantesco oggetto JSON**
(`{ "nodes": [...], "links": [...] }`) vincolato da `responseMimeType` +
`responseSchema`. Lo riceviamo via SSE ma **lo ricomponiamo in un solo blocco**
prima di darlo al renderer, che poi tenta `salvageTruncatedJSON()`.

Questo approccio ha tre punti deboli noti e documentati:

1. **Troncamento catastrofico** — se il modello tocca `max_tokens` a metà
   dell'array `nodes`, perdiamo il `]` di chiusura e **l'intero array `links`**
   (§8 "Gemini Pro tronca KG", + open-source che si fermano a 13 nodi).
2. **Distorsione del bridge** — su Infomaniak `responseMimeType:"application/json"`
   diventa o uno schema `json_schema` (Gemma/Kimi) a cui i modelli aderiscono
   solo a metà, o un **promemoria testuale** appiccicato al prompt (Apertus/Qwen)
   che inquina il contesto (§8 Causa C: densità ferma a 1.31, 36% relazioni
   generiche, contro densità 2.0 / 0% di Google sullo stesso template).
3. **Zero feedback incrementale** — l'utente (target BES/DSA!) vede uno spinner
   opaco per 30-60s; il renderer non riceve nulla fino alla fine.

La proposta: passare a **JSONL / NDJSON** (un oggetto JSON compatto per riga)
sfruttando il **transport SSE che già usiamo**. Il main process bufferizza per
`\n` e fa il parse di ogni riga completa man mano che arriva.

**Il transport non cambia** (SSE è già attivo): cambia solo il *contenuto* che
chiediamo al modello (righe invece di megastruttura) e *come lo consumiamo*
(per riga invece che in blocco). Nessuna nuova capacità API richiesta —
Infomaniak supporta già SSE come confermato dalla doc.

---

## 1. Architettura attuale (as-is)

```
renderer (app.js)
  └─ build payload Gemini  { contents, systemInstruction,
                             generationConfig: { responseMimeType:"application/json",
                                                 responseSchema, maxOutputTokens } }
  └─ fetchModelAPI()                                  [app.js:1634]
       └─ InfomaniakBridge.translatePayload()         [infomaniak_bridge.js:9]
            • Gemma/Kimi → response_format: json_schema (strict:false)
            • Apertus/Qwen → schema + "REGOLE DI OUTPUT" iniettate nel testo
       └─ electronAPI.generateInfomaniak(...)  →  IPC 'generate-infomaniak'
            main.js:128
              • payload.stream = true                 [main.js:134]
              • legge SSE, accumula delta.content in `fullText`  [main.js:148-166]
              • on 'end' → ricostruisce UN chat.completion con tutto fullText
       └─ InfomaniakBridge.translateResponse()  → formato Gemini
  └─ salvageTruncatedJSON(fullText)                    [app.js:3429]
  └─ post-processing (livelli, hub promotion, markKgCrossLinks)
```

**Osservazione chiave:** lo streaming SSE c'è *già*, ma serve solo a non far
scadere il Gateway Timeout. Il flusso viene **ricollassato in un blocco unico**
prima di toccare il renderer. Stiamo pagando il costo dello streaming senza
incassarne i benefici (robustezza + UX).

---

## 2. Architettura proposta (to-be)

### 2.1 Formato sul filo: JSONL

Il modello emette **una riga = un record completo e auto-contenuto**:

```jsonl
{"t":"meta","root":"La Rivoluzione Francese","mode":"kg"}
{"t":"node","id":"n1","label":"Antico Regime","level":1,"desc":"...","chunks":["..."]}
{"t":"node","id":"n2","label":"Terzo Stato","level":2,"desc":"...","chunks":["..."]}
{"t":"link","source":"n2","target":"n1","rel":"si oppone a"}
{"t":"link","source":"n1","target":"n3","rel":"causa"}
```

- Ogni riga è JSON valido e indipendente → un troncamento perde **solo l'ultima
  riga parziale**, non tutto il resto.
- Il campo discriminante `t` (`meta`/`node`/`link`) consente di mescolare tipi
  nello stesso stream e di emettere i link **subito dopo** i nodi che li
  collegano (utile per lo streaming live in fase 2).
- Niente nidificazione profonda: i modelli open-source sono molto più affidabili
  a "ripeti questa forma piatta N volte" che a "produci un mega-oggetto annidato
  che valida contro uno schema".

### 2.2 Parsing per-riga nel main process

`main.js` mantiene un **buffer di riga**: ad ogni `delta.content` accumula, fa
`split('\n')`, tiene l'ultimo frammento come remainder (potenzialmente parziale)
e fa `JSON.parse` di ogni riga **completa**. Le righe valide vengono raccolte
(fase 1) o inoltrate live al renderer (fase 2).

### 2.3 Niente più `responseMimeType` / `responseSchema` su Infomaniak

Coerente con la **regola #6** di CLAUDE.md. Sul ramo Infomaniak il payload non
porta più `response_format` né lo schema iniettato nel testo: al suo posto
un'istruzione semplice e robusta nel prompt ("emetti un oggetto JSON compatto
per riga, niente altro, niente markdown, niente a-capo dentro l'oggetto").

---

## 3. Vantaggi per Infomaniak (risposta alle domande di Giacomo)

### 3.1 «Quali vantaggi avremo?»

| # | Vantaggio | Impatto | Problema CLAUDE.md risolto |
|---|-----------|---------|----------------------------|
| 1 | **Troncamento non distruttivo** — perdi 1 riga, non l'intero grafo | 🔴 Alto | §8 "Gemini Pro tronca KG"; open-source a 13 nodi |
| 2 | **Niente distorsione del bridge** (via `responseMimeType`) | 🔴 Alto | §8 Causa C; regola #6 |
| 3 | **Aderenza al prompt migliore** — forma piatta = punto di forza dei modelli | 🟠 Medio-alto | §8 Causa C (densità 1.31 → atteso ↑) |
| 4 | **Economia di token** — meno scaffolding strutturale per token | 🟠 Medio | §7 anomalia "37K token / 13 nodi" Gemma+lenti |
| 5 | **UX incrementale** (fase 2) — la mappa si costruisce a vista | 🟠 Medio | UX target BES/DSA |
| 6 | **Diagnostica `finish_reason`** esplicita ("troncato, salvati N record") | 🟢 Basso | trasparenza |

### 3.2 «Sfrutteremo al meglio il potenziale dei modelli?»

**Sì, e qui sta il punto centrale.** I LLM autoregressivi sono ottimi a
*emettere una forma semplice ripetutamente* e deboli a *chiudere correttamente
una megastruttura annidata vincolata da schema*. Oggi gli chiediamo la cosa
difficile e poi proviamo a salvare i pezzi. Con JSONL gli chiediamo la cosa
facile. In più:

- Niente budget di token speso in `json_schema` strict / promemoria testuali
  → tutto il budget va in **contenuto** (più nodi, relazioni più ricche).
- Il modello non deve "tenere a mente" di chiudere `]` e `}` 200 nodi dopo:
  ogni riga è chiusa e dimenticata. Meno *drift* strutturale a fine output.
- Apertus 70B (NO function calling, §3) e Qwen (vuoto con `json_schema`)
  diventano di colpo **utilizzabili allo stesso modo** di Gemma/Kimi: JSONL
  è solo testo, non richiede capacità di tool/schema. **Livella i provider.**

### 3.3 «Perderemo qualcosa? Ci sono downside?»

| # | Downside | Severità | Mitigazione |
|---|----------|----------|-------------|
| 1 | Perdiamo la **validazione schema nativa** (Gemma/Kimi `json_schema`) | 🟠 | Validatore per-riga lato JS (coercizione tipi, enum `rel`, dedupe id). NB: lo schema su Infomaniak distorceva già — è più feature che perdita. |
| 2 | **Due formati da mantenere**: Google = mega-JSON nativo, Infomaniak = JSONL | 🟠 | Convertire SOLO Infomaniak. Google funziona già benissimo (densità 2.0) → non si tocca, zero regressioni. |
| 3 | **Plumbing IPC** per lo streaming live (fase 2) | 🟠 | Fase 1 NON lo richiede (accumula-poi-processa). Lo isoliamo in fase 2. |
| 4 | **Confini di riga negli SSE delta** — un chunk può spezzare una riga | 🟠 | Buffer-remainder per `\n` (standard NDJSON). Già descritto in §2.2. |
| 5 | **Modelli che emettono JSON "pretty"** (a-capo dentro l'oggetto) rompono lo split per `\n` | 🟠 | (a) istruzione "compatto, una riga"; (b) fallback splitter a profondità di graffe (riusa `_extractBalancedJSON`, app.js). |
| 6 | **Post-processing del renderer assume array completi** (livelli, hub promotion, `markKgCrossLinks`) | 🟢 | Fase 1 ricostruisce gli array completi a fine stream → il codice a valle resta identico. Solo fase 2 lo renderebbe incrementale. |
| 7 | Template prompt da **duplicare in variante JSONL** (IT+EN, MM+KG) | 🟢 | Iniziare dal solo KG single-pass (il dolore documentato), poi estendere. |

**Cosa NON perdiamo:** il transport SSE (già lì), il timeout di 10 min, il
tracking usage/token, la compatibilità del renderer (fase 1), il percorso Google
(intatto). Il cambiamento è **reversibile** (feature flag, vedi §6).

---

## 4. Scope e fasi

Disaccoppiamo il **guadagno di robustezza** (facile, alto valore) dal **guadagno
di UX live** (più invasivo). Due fasi indipendenti, ciascuna rilasciabile da sola.

### FASE 1 — JSONL "accumula-poi-processa" (robustezza)
> Cambia il formato sul filo, NON il modo in cui il renderer consuma.
> Rischio basso, beneficio alto. **Questa è la priorità.**

- Il main accumula le righe parse-ate in un array e, a `end`, ricostruisce
  `{ nodes, links }` esattamente come oggi → `salvageTruncatedJSON` diventa quasi
  superfluo (lo teniamo come rete di sicurezza sull'ultima riga parziale).
- `translateResponse` riceve già l'oggetto ricostruito.
- Il renderer e tutto il post-processing **non cambiano**.

### FASE 2 — Streaming live verso il renderer (UX)
> Solo dopo che la fase 1 è validata su tutti i modelli.

- Nuovo canale IPC event-based (`onInfomaniakRecord`) in `preload.js`.
- Il renderer aggiunge nodi/link al grafo D3 man mano che arrivano.
- Il post-processing (livelli, hub) viene spostato a fine stream o reso
  incrementale. Richiede refactor di `markKgCrossLinks` & co.

---

## 5. Piano di implementazione dettagliato (FASE 1)

### 5.1 `main.js` — handler `generate-infomaniak` (righe 128-225)
- Introdurre un **buffer di riga** accanto a `fullText`:
  ```
  let lineBuf = '';
  const records = [];
  // on 'data': lineBuf += delta.content; split su '\n';
  //   per ogni riga completa: parse → records.push; tieni il resto in lineBuf
  // on 'end': tenta parse dell'ultimo lineBuf (riga finale senza \n);
  //   se fallisce → salvage parziale o scarta (è solo l'ultima riga)
  ```
- Mantenere `fullText` in parallelo per retro-compatibilità/diagnostica.
- A `end`, restituire un oggetto che porti **sia** `records` **sia** il
  `finish_reason` (per distinguere "completato" da "troncato").
- Splitter a profondità di graffe come fallback se una riga non è JSON valido
  ma il buffer contiene un oggetto bilanciato (modelli "pretty").

### 5.2 `infomaniak_bridge.js` — `translatePayload` (righe 9-106)
- Aggiungere un flag `jsonlMode` (deciso da `fetchModelAPI`/feature flag).
- Quando `jsonlMode`:
  - **NON** impostare `response_format` (niente `json_schema`).
  - **NON** iniettare lo schema-esempio + "REGOLE DI OUTPUT" attuali.
  - Iniettare invece l'istruzione JSONL (compatta, una riga per record, campo
    `t`, niente markdown, niente a-capo interni) in coda all'ultimo messaggio.
- `translateResponse`: nuovo ramo che, ricevuti i `records`, ricostruisce
  `{ nodes, links }` e lo serializza nel `parts[0].text` (così il renderer
  continua a chiamare `salvageTruncatedJSON` su un JSON già pulito e valido).

### 5.3 `app.js`
- `fetchModelAPI` (1634): attivare `jsonlMode` solo se
  `appState.aiProvider === 'infomaniak'` **e** feature flag on.
- Payload KG single-pass (3590-3601) e branch MM: quando Infomaniak+JSONL,
  **non** passare `responseMimeType`/`responseSchema` (li costruisce comunque
  il bridge, ma teniamo il payload pulito per coerenza con regola #6).
- `salvageTruncatedJSON` (3429): resta come rete di sicurezza; documentare che
  con JSONL è quasi sempre un no-op.

### 5.4 Template prompt (`prompts_default.json` / `prompts_config.json`)
- Creare variante JSONL del solo **KG single-pass** per primo
  (`KNOWLEDGE_GRAPH_SINGLE_JSONL_IT`), con l'istruzione di output a righe e
  `{{focusTopic}}` **prima** dell'eventuale esempio (regola §8 / "focus prima
  dello schema").
- Backup `.bak` prima di toccare i file di config (come già fatto per Causa A+B).

### 5.5 Feature flag
- `localStorage.getItem('infomaniak_jsonl_mode')` (default off in dev, on dopo
  validazione). Permette rollback istantaneo e A/B contro il percorso attuale.

---

## 6. Test e validazione (regola #8 — entrambi i provider)

1. **Google intatto** — verificare zero regressioni sul percorso Gemini
   (non passa mai da `jsonlMode`).
2. **Matrice Infomaniak** — KG single-pass su Gemma-4, Kimi-K2, Qwen3.5,
   Apertus-70B. Metriche con `MappAIStructureAnalyzer.analyzeCurrentMap()`:
   densità, % relazioni generiche, n° nodi, n° tipi di relazione.
   Confronto diretto contro i numeri di §8 (target: densità Gemma 1.31 → ≥1.8).
3. **Caso troncamento** — forzare `max_tokens` basso e verificare che si salvino
   N-1 record invece di 0.
4. **Caso "pretty JSON"** — verificare il fallback splitter a graffe.
5. **Apertus/Qwen** — verificare che, senza `json_schema`, ora producano un KG
   valido (oggi Qwen risponde vuoto con json_schema).

---

## 7. Rischi residui e domande aperte

- **Multi-pass MM**: la fase L1 macro-categorie è minuscola → non vale la pena
  convertirla; le espansioni di ramo sì, ma dopo il KG. Confermare l'ordine.
- **`chunks` per-nodo**: array dentro la riga `node` — resta JSON valido inline,
  nessun problema, ma allunga la riga (occhio a modelli che vanno a capo).
- **Coesistenza con le lenti** (`focusTopic`): l'iniezione JSONL deve restare
  **prima** dell'eventuale esempio di output, mai dopo (§8).
- **Decisione di scope**: JSONL solo Infomaniak (raccomandato) o anche Google?
  Raccomando **solo Infomaniak** in prima battuta: Google funziona già.

---

## 8. Stima e ordine di lavoro

1. (S) Feature flag + variante template KG JSONL IT + backup `.bak`.
2. (M) `main.js`: buffer di riga + parsing per-riga + fallback graffe.
3. (S) `infomaniak_bridge.js`: ramo `jsonlMode` in translate/translateResponse.
4. (S) `app.js`: attivazione flag in `fetchModelAPI`, payload pulito.
5. (M) Test matrice Infomaniak + confronto metriche §8.
6. (S) Template EN + MM branch (dopo validazione KG).

> Fase 2 (streaming live UI) stimata separatamente, da pianificare solo dopo
> che la Fase 1 è in produzione e validata.
