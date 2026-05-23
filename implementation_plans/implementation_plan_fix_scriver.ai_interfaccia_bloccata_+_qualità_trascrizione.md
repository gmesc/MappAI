# Fix Scriver.AI: Interfaccia Bloccata + Qualità Trascrizione

Due problemi distinti ma interconnessi impediscono all'applicazione di funzionare correttamente nella versione root.

---

## Problema 1: L'interfaccia non mostra avanzamento

### Diagnosi

Ho analizzato il flusso completo `processAudio()` → `POST /process-audio/` → `pollStatus()` → `GET /status/` e ho identificato **tre cause radice**:

#### A. La `processAudio()` nel frontend si blocca prima di impostare `activeJob = true`

Il frontend (riga ~1337) imposta `activeJob = true` **solo dopo** aver ricevuto la risposta dal `POST /process-audio/`. Questo è corretto. Tuttavia il polling (`pollStatus`) gira ogni secondo ma **controlla `if (activeJob)`** (riga 1709). Se la `POST` impiega troppo tempo a rispondere, il polling non mostra nulla.

In realtà il backend risponde subito con `{"status": "processing"}` — quindi questo non è il vero blocco.

#### B. **BUG CRITICO: Il monitorCard non viene mostrato correttamente**

Quando `processAudio()` viene chiamata, imposta `monitorCard` visibile alla riga 1338. Tuttavia:
- La funzione `processAudio()` è definita **due volte** nel file: una alla riga **1288** e una logica equivalente chiamata indirettamente da `startProcessing()` (riga 2199).
- `startProcessing()` chiama `processAudio()` che è la **prima** definizione (riga 1288). Questa funzione **funziona correttamente** — mostra il monitor e lancia il polling.
- **Il vero problema è la fase `finalize-process`**: dopo che il modale di Review viene chiuso e `finalizeProcess()` viene chiamata (riga 1635), il frontend fa un `fetch` sincrono (con `await`) al `POST /finalize-process/`. Questo endpoint è **sincrono** (`def`, non `async def`) nel backend — il che è buono per non bloccare l'event loop. **Ma il problema è che `finalize_process` è una funzione molto lunga** (trascrizione → Presidio → Ollama → Markdown → salvataggio), e durante tutta la sua esecuzione la `fetch` nel browser sta in attesa senza aggiornare la UI. Il risultato: **nessun feedback per 2-15 minuti**.

#### C. **Lo status polling non viene riattivato dopo il modale Review**

Dopo che il modale Review appare (`awaiting_review`), il polling si ferma (`activeJob = false`). Quando l'utente clicca "Genera Report Finale", `finalizeProcess()` fa una `fetch` bloccante — ma **non riattiva il polling** né mostra il monitor. L'utente vede la pagina congelata.

### Soluzione Proposta

> [!IMPORTANT]
> La `finalize-process` è il collo di bottiglia: deve diventare asincrona come `process-audio`.

1. **Convertire `finalize-process` in un job asincrono** — il backend riceve la richiesta, la accoda in un `ThreadPoolExecutor`, e risponde subito con `{"status": "processing"}`. Il frontend riattiva il polling che legge da `job_progress` e aggiorna la UI in tempo reale.
2. **Aggiungere aggiornamenti di stato granulari** dentro `finalize_process` (le 7 fasi che già stampa con `print` diventano `set_stage()` e aggiornano `job_progress`).
3. **Nel frontend**: dopo il `finalizeProcess()`, mostrare il monitorCard, reimpostare `activeJob = true`, e riavviare i timer.

---

## Problema 2: Qualità trascrizione scadente

### Diagnosi

Ho confrontato le dipendenze installate con le versioni note per funzionare bene:

| Pacchetto | Versione installata | Problema |
|---|---|---|
| **whisperx** | 3.8.5 | Versione molto recente — ha cambiato la API interna |
| **faster-whisper** | 1.2.1 | Versione recente — non più compatibile con MPS |
| **ctranslate2** | 4.7.1 | Versione recente |
| **torch** | 2.8.0 | Molto recente — introduce incompatibilità |
| **numpy** | 1.26.4 | ✅ OK (downgrade eseguito) |
| **pyannote.audio** | 4.0.4 | Versione 4.x — API diverse dalle 3.x |

#### Cause della bassa qualità:

1. **Uso di `model.model.transcribe()` invece di `whisperx.transcribe()`**: Il codice bypassa completamente l'API di alto livello di WhisperX e chiama direttamente `faster-whisper` (riga 583). Questo bypassa:
   - Il **VAD (Voice Activity Detection)** di Pyannote che WhisperX usa per tagliare i silenzi e processare solo le parti con voce.
   - La gestione intelligente dei chunk audio lunghi.
   - La normalizzazione del linguaggio.

2. **`compute_type="float32"` su CPU** è inutilmente pesante per `faster-whisper`. Il tipo `int8` su CPU è **più veloce** e spesso **più preciso** (quantizzazione ottimizzata di CTranslate2). La vecchia versione common usava `int8` come fallback CPU.

3. **Nessun `language="it"` forzato nel modello**: Il codice forza `language=language` solo nella chiamata `model.model.transcribe()`, ma la variabile `language` è inizializzata a `"it"`. Tuttavia, `whisperx.load_model()` **non riceve il parametro language**, quindi il modello viene caricato senza hint linguistico.

4. **`beam_size=5`** è il default — andrebbe bene, ma combinato con i problemi sopra, contribuisce alla lentezza senza beneficio di qualità.

### Soluzione Proposta

> [!IMPORTANT]
> Tornare all'API di alto livello di WhisperX per la trascrizione, mantenendo il feedback progressivo.

1. **Usare `model.transcribe()` (WhisperX API)** al posto di `model.model.transcribe()`. Questo riattiva il VAD e la segmentazione intelligente.
2. **Usare `compute_type="int8"` su CPU** — più veloce e stabile su Mac.
3. **Forzare `language="it"`** nella chiamata `whisperx.load_model()`.
4. **Mantenere il feedback progressivo** ricostruendolo dal risultato di `model.transcribe()` (che ritorna tutti i segmenti con timestamps, permettendo di calcolare la percentuale dopo la trascrizione).
5. **Aggiungere `vad_onset` e `vad_offset`** per ottimizzare il VAD di Pyannote integrato in WhisperX.

---

## Proposed Changes

### Backend — [main.py](file:///Users/giacomomeschini/Antigravity/Scriver_AI/backend/main.py)

#### Modifica 1: Trascrizione WhisperX (righe ~565-605)

Sostituire la chiamata diretta a `model.model.transcribe()` con `model.transcribe()`:

```diff
- segments_gen, info = model.model.transcribe(audio, beam_size=5, language=language, initial_prompt=initial_prompt)
- segments = []
- for s in segments_gen:
-     seg_dict = {"start": s.start, "end": s.end, "text": s.text}
-     segments.append(seg_dict)
-     job_progress["transcript_queue"].append(s.text)
-     ...
- result = {"segments": segments, "language": info.language}
+ result = model.transcribe(audio, batch_size=8, language="it", initial_prompt=initial_prompt)
+ # Aggiorna il feedback dopo la trascrizione completa
+ for seg in result.get("segments", []):
+     job_progress["transcript_queue"].append(seg.get("text", ""))
+     if len(job_progress["transcript_queue"]) > 50:
+         job_progress["transcript_queue"].pop(0)
+ language = result.get("language", "it")
```

#### Modifica 2: Parametri modello (riga ~576)

```diff
- model = whisperx.load_model("large-v2", asr_device, compute_type=compute_type)
+ model = whisperx.load_model(
+     "large-v2", asr_device,
+     compute_type="int8",
+     language="it",
+     vad_options={"vad_onset": 0.500, "vad_offset": 0.363}
+ )
```

#### Modifica 3: `finalize-process` asincrono (righe ~1225-1430)

Ristrutturare l'endpoint per lanciare il lavoro in background:

```python
@app.post("/finalize-process/")
async def finalize_process(data: dict = Body(...)):
    # Reset job_progress per il polling
    job_progress["status"] = "processing"
    job_progress["start_time"] = time.time()
    job_progress["percent"] = 2
    job_progress["phase"] = "[Sistema] Avvio finalizzazione..."
    job_progress["transcript_queue"] = []
    
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _run_finalize, data)
    
    return {"status": "processing"}

def _run_finalize(data):
    # Tutto il codice attuale di finalize_process va qui,
    # con set_stage() per aggiornare job_progress ad ogni fase.
    # Alla fine: job_progress["status"] = "completed"
    # e job_progress["final_data"] = {...}
```

---

### Frontend — [index.html](file:///Users/giacomomeschini/Antigravity/Scriver_AI/frontend/index.html)

#### Modifica 4: `finalizeProcess()` (riga ~1635)

Dopo aver inviato la richiesta, mostrare il monitor e riattivare il polling:

```diff
  const res = await fetch(`${API_BASE}/finalize-process/`, ...);
  const result = await res.json();
- if (result.status === "success") {
-     handleSuccess(result.data);
-     closeReview();
- }
+ if (result.status === "processing") {
+     // Chiudi il modale review e mostra il monitor
+     document.getElementById('reviewModal').classList.add('hidden');
+     document.getElementById('monitorCard').classList.remove('hidden');
+     document.getElementById('monitorTitle').innerText = "Generazione Report...";
+     activeJob = true;
+     startTimers();
+     // Il polling è già attivo, aggancerà i nuovi stati
+ } else if (result.status === "success") {
+     handleSuccess(result.data);
+     closeReview();
+ }
```

---

## Riepilogo Modifiche

| # | File | Cosa | Impatto |
|---|---|---|---|
| 1 | `backend/main.py` | Usare `model.transcribe()` invece di `model.model.transcribe()` | Qualità trascrizione |
| 2 | `backend/main.py` | `compute_type="int8"`, `language="it"`, VAD options | Velocità + qualità |
| 3 | `backend/main.py` | `finalize-process` diventa asincrono con feedback | UI reattiva durante generazione |
| 4 | `frontend/index.html` | `finalizeProcess()` mostra monitor e riattiva polling | UI mostra avanzamento |

---

## Open Questions

> [!IMPORTANT]
> **Feedback progressivo durante la trascrizione**: Con `model.transcribe()`, WhisperX processa l'audio in batch e restituisce tutti i segmenti alla fine. Questo significa che durante la fase di trascrizione (che può durare 5-10 minuti per file lunghi), il frontend mostrerà solo "Trascrizione in corso..." senza segmenti live. È accettabile?
> **Alternativa**: Possiamo usare un approccio ibrido — `model.transcribe()` per la qualità, con un timer che stima la percentuale basandosi sulla durata dell'audio (come già fa la vecchia versione).

> [!WARNING]
> **Compatibilità con la versione `common/backend`**: Queste modifiche toccano solo la versione root (`/backend/main.py`). La versione comune in `scriver_AI_app/common/backend/main.py` ha lo stesso problema di trascrizione con MPS ma ha errori propri (usa `mps` per `whisperx.load_model()` che crasherà). Vuoi che applichi le stesse correzioni anche lì?

---

## Verification Plan

### Automated Tests
1. Avviare il backend root con `python3 -m uvicorn main:app --port 8000`
2. Aprire il frontend nel browser
3. Caricare un file audio di test (~2 minuti)
4. Verificare che:
   - La barra di progresso si muove durante la trascrizione
   - Il modale Review appare con speaker e anteprime
   - Dopo "Genera Report Finale", il monitorCard riappare con le 7 fasi visibili
   - Il report finale viene generato correttamente

### Manual Verification
- Confrontare la qualità della trascrizione dello stesso audio con la versione precedente
- Verificare che i tempi di elaborazione siano ragionevoli (< 5 min per 2 min di audio)
