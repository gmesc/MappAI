# Miglioramento Feedback Real-Time durante la Diarizzazione

Questo piano mira a risolvere il problema della dashboard che si "congela" all'85% durante la fase di identificazione dei parlanti (diarizzazione). Implementeremo un sistema di callback che comunica costantemente con il frontend, mostrando l'avanzamento percentuale interno alla diarizzazione e log dettagliati delle operazioni in corso.

## User Review Required

> [!NOTE]
> La diarizzazione su CPU (scelta per stabilità su Mac) rimane un processo intrinsecamente lento. Questi cambiamenti non velocizzano il calcolo, ma rendono l'attesa consapevole fornendo feedback visivo costante.

## Proposed Changes

### Backend

#### [MODIFY] [main.py](file:///Users/giacomomeschini/Antigravity/Scriver_AI_MLX/backend/main.py)
- Definizione di una funzione di callback `diarize_progress_callback` all'interno di `run_whisperx_pipeline`.
- La callback mapperà il progresso di `pyannote` (0-100%) nell'intervallo UI **85% - 89%**.
- Integrazione della callback nella chiamata `diarize_model(audio_data, progress_callback=...)`.
- Aggiunta di log specifici per le sotto-fasi di diarizzazione (Segmentation, Embeddings, Clustering) per popolare la console di sistema.

### Frontend

#### [MODIFY] [index.html](file:///Users/giacomomeschini/Antigravity/Scriver_AI_MLX/frontend/index.html)
- Rafforzamento della logica di visualizzazione del "Countdown" e dei log durante la fase 7.
- Aggiunta di micro-animazioni o messaggi rassicuranti specifici per le lunghe attese della diarizzazione.

## Verification Plan

### Automated Tests
- Avvio di una trascrizione di prova e monitoraggio del log di sistema per verificare che la callback venga invocata.
- Verifica tramite il tool browser che la percentuale passi da 85% a 86%, 87%, ecc. in modo fluido invece di saltare da 85% a 90%.

### Manual Verification
- Caricamento di un file audio di almeno 5-10 minuti.
- Osservazione della console di sistema nel frontend: devono apparire righe come "[Diarizzazione] Analisi impronte vocali (45%)...".
- Verifica che il timer e la barra di avanzamento si muovano coerentemente.
