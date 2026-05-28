# Supervised Diarization Workflow

## Obiettivo
Trasformare la diarizzazione da un processo "black-box" lento e prono a timeout in un workflow interattivo dove l'utente conferma l'identità delle voci tramite campioni audio.

## Proposed Changes

### Componente: Backend (FastAPI)

#### [MODIFY] [main.py](file:///Users/giacomomeschini/Antigravity/Scriver_AI_MLX/backend/main.py)
1.  **Nuovo Endpoint `GET /audio-sample/{job_id}/{speaker_id}`**: Restituisce un frammento `.wav` di 5 secondi estratto dal file audio restaurato per quel particolare speaker.
2.  **Modifica `run_heavy_processing`**: 
    *   Aumentare il timeout della diarizzazione o implementare una "diarizzazione preliminare".
    *   Al termine della diarizzazione grezza (quella che produce SPEAKER_00, SPEAKER_01), salvare lo stato e mettere il job in `status="awaiting_speaker_mapping"`.
3.  **Nuovo Endpoint `POST /submit-speaker-map/`**: Riceve il mapping (es. `{"SPEAKER_00": "Dott. Meschini", "SPEAKER_01": "Paziente"}`) e sblocca la fase finale (GDPR e composizione report).

---

### Componente: Frontend (UI)

#### [MODIFY] [index.html](file:///Users/giacomomeschini/Antigravity/Scriver_AI_MLX/frontend/index.html)
1.  **Modal "Identificazione Parlanti"**:
    *   Lista degli speaker individuati.
    *   Player audio per ogni speaker.
    *   Dropdown pre-compilato con Medico (dai settings) e Paziente.
2.  **Logica di Polling**: Quando lo stato è `awaiting_speaker_mapping`, blocca la progress bar e mostra il modal.

---

## Verification Plan

### Test Manuale
1. Caricare un file audio di 1-2 minuti.
2. Verificare che dopo la fase di allineamento appaia il modal.
3. Ascoltare i campioni e assegnare i nomi.
4. Verificare che il report finale contenga i nomi corretti invece di "SPEAKER_00".
