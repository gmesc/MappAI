# Piano di Implementazione: Report Composer & Rielaborazione Offline

Questo piano introduce una granularità senza precedenti nella generazione dei report e permette di riutilizzare trascrizioni passate.

## User Review Required

> [!IMPORTANT]
> **Modifiche al Flusso di Salvataggio**
> Verrà creato un terzo file per ogni sessione: `_Trascrizione_Integrale.md`. Questo garantisce che, indipendentemente dall'analisi scelta, il testo grezzo sia sempre a tua disposizione in formato pulito.
> 
> **Parsing dei file .md caricati**
> La funzione di caricamento vecchi file tratterà l'intero contenuto del file come "Sorgente di input". Se carichi un vecchio verbale di Scriba, il sistema sarà istruito a ignorare l'intestazione e l'analisi precedente concentrandosi sulla trascrizione.

## Modifiche Proposte

### Backend [main.py](file:///Users/giacomomeschini/Antigravity/Scriba%20Ambientale/backend/main.py)

#### [MODIFY] `generate_report` (Logica Modulare)
- Sostituzione dei template statici con una costruzione a blocchi:
    - `module_obiettivi`: Istruzioni per sintesi generale o mappatura per persona.
    - `module_task`: Elenco unico (Globali) o attribuzione responsabili (Individuali).
    - `module_sentiment`: Valutazione del clima o profilo psico-attitudinale del singolo.

#### [NEW] Endpoint `/process-existing-text/`
- Riceve un testo (estratto da un .md nel frontend) e la configurazione del report.
- Salta WhisperX e Diarizzazione, andando direttamente alla generazione del report.

#### [MODIFY] `finalize_process`
- Aggiunta salvataggio file `[ID]_Trascrizione_Integrale.md`.

### Frontend [index.html](file:///Users/giacomomeschini/Antigravity/Scriba%20Ambientale/frontend/index.html)

#### [NEW] Report Composer UI
- Interfaccia a bottoni "premium" per:
    - **Macro-Tipo**: [Verbale] [Riassunto]
    - **Moduli**: Switch per Obiettivi, Task, Deadline, Sentiment con selettore "Generale/Individuale".

#### [NEW] Modalità "Rielabora File"
- Integrazione di un pulsante "Carica .md Esistente" nella dashboard.
- Funzione JS per leggere il contenuto del file localmente e inviarlo al backend per una nuova analisi AI.

## Piano di Verifica
1. **Test Modulare**: Produrre un report con solo "Sentiment Generale" e verificare che l'IA non elenchi task o obiettivi.
2. **Test Rielaborazione**: Caricare un vecchio verbale `.md` e generare un "Riassunto Individuale" senza caricare audio.
3. **Verifica File**: Controllare che nella cartella `verbali` compaia sempre il file di trascrizione pura.
