# Progetto: Ripristino Feedback di Avanzamento UI

L'utente segnala che la barra di avanzamento e i messaggi di fase rimangono bloccati durante l'elaborazione, nonostante il backend completi correttamente il lavoro. Le ricerche hanno evidenziato duplicazioni di rotte nel backend e una gestione inefficiente del buffer di testo nel frontend.

## User Review Required

> [!IMPORTANT]
> Ho rilevato che nel backend (`main.py`) la rotta `/status/` è definita due volte. Questo può causare comportamenti imprevedibili a seconda di quale funzione FastAPI decida di servire. La pulizia di queste duplicazioni è prioritaria.

## Proposed Changes

### Backend (`backend/main.py`)

#### [MODIFY] [main.py](file:///Users/giacomomeschini/Antigravity/Scriver_AI/backend/main.py)
- **Deduplicazione Rotte**: Rimuovere la definizione ridondante di `@app.get("/status/")` a riga 184, mantenendo quella più completa a riga 674 (che gestisce anche lo svuotamento della coda di trascrizione).
- **Deduplicazione Funzioni**: Rimuovere la funzione ridondante `is_ollama_reachable()` a riga 268.
- **Ottimizzazione Status**: Assicurarsi che ogni cambio di fase imposti correttamente `job_progress["status"] = "processing"` se non già presente.

---

### Frontend (`frontend/index.html`)

#### [MODIFY] [index.html](file:///Users/giacomomeschini/Antigravity/Scriver_AI/frontend/index.html)
- **Correzione `pollStatus`**: 
    - Evitare la sovrascrittura totale di `buffer.innerHTML` quando arriva della trascrizione. Invece di `= data.transcript_queue.map(...)`, useremo un metodo che *aggiunge* i nuovi segmenti senza cancellare i log delle fasi precedenti.
    - Implementare un controllo per evitare che `activeJob` rimanga `true` se il poll fallisce ripetutamente o se il backend restituisce stati non gestiti.
- **Sincronizzazione `activeJob`**: Uniformare l'attivazione di `activeJob` in tutte le pipeline (audio e testo diretto) per garantire che il monitor sia visibile e il timer parta solo quando il job è effettivamente confermato dal backend.

## Open Questions

Non ci sono domande aperte critiche. Il problema sembra puramente tecnico legato alla duplicazione del codice e alla gestione del DOM.

## Verification Plan

### Automated Tests
- Non applicabile direttamente con i tool correnti (richiede test d'integrazione browser).

### Manual Verification
1. Avviare un'elaborazione audio e verificare che la barra di progressione si muova (dal 2% al 100%).
2. Verificare che l'icona dello strumento (Whisper, Pyannote, Presidio, Ollama) cambi dinamicamente.
3. Verificare che i log nel `liveTextBuffer` non vengano cancellati quando arrivano nuovi segmenti di trascrizione.
4. Testare la rielaborazione di un file di testo esistente e controllare che il monitor reagisca.
