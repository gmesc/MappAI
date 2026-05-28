# Scriver.AI — Pacchetto .dmg per macOS

## Descrizione del Progetto

Creare un'app macOS distribuibile come `.dmg` per Scriver.AI, un sistema locale per trascrizione audio, diarizzazione, anonimizzazione GDPR e report AI. L'app deve funzionare **100% offline** su MacBook Air 2025 (M3/M4, 16GB RAM).

## Vincoli Chiave

- **Target**: MacBook Air 2025, macOS, 16GB RAM
- **100% Offline**: Nessuna connessione internet durante l'uso (HF download è una fase di setup iniziale una tantum)
- **No LLM nel .dmg**: I modelli Ollama (~4.6GB) non devono essere inclusi nel pacchetto
- **Cartelle output user-friendly**: Le trascrizioni devono essere facilmente trovabili

---

## Architettura dell'App

L'app usa un approccio **Electron-like leggero** basato su `pywebview` — una finestra nativa macOS che carica il frontend HTML/JS e avvia il backend FastAPI in background. Questo evita la complessità di Electron (700MB+) e usa direttamente l'ambiente Python già installato.

### Flusso:

```
ScriverAI.app (doppio click)
  └─ launcher.py (pywebview)
       ├─ Avvia FastAPI (uvicorn) in background thread
       ├─ Apre finestra nativa macOS con webview
       ├─ Mostra modale HF Token al primo avvio
       └─ Salva dati in ~/Documenti/ScriverAI/
```

---

## User Review Required

> [!IMPORTANT]
> **Cartelle di output**: I verbali e le trascrizioni verranno salvati in `~/Documenti/ScriverAI/verbali/` e `~/Documenti/ScriverAI/trascrizioni_grezze/`. In questo modo l'utente li trova facilmente dal Finder. Approvi questa posizione?

> [!IMPORTANT]
> **Approccio al packaging**: Uso **py2app** per creare la `.app` nativa macOS dal launcher Python. Il .dmg conterrà solo la `.app` + una cartella Applications (stile drag-and-drop). Il .dmg **NON includerà** i modelli LLM (~4.6GB) né i dati delle sessioni precedenti. **Accetti questo approccio?**

> [!WARNING]
> **Dipendenza ambiente Python**: L'app richiede che tutte le dipendenze Python (whisperx, presidio, torch, spacy, etc.) siano installate nel sistema. py2app le bundlerà automaticamente nel `.app`. Il pacchetto finale sarà circa **2-4GB** (a causa di PyTorch + SpaCy models). È accettabile?

> [!IMPORTANT]  
> **Download modelli HF**: Il modale per il token HF e il menu download modelli richiedono una connessione internet **solo nella fase di configurazione iniziale**. Dopo che i modelli sono scaricati, l'app funziona 100% offline. Confermo che questo è il comportamento atteso?

---

## Proposed Changes

### 1. Struttura App Nativa

#### [NEW] `scriver_AI_app/` — Cartella principale del progetto .app

La struttura sarà:

```
scriver_AI_app/
├── build_app.sh          # Script per generare .app e .dmg
├── setup.py              # Configurazione py2app 
├── launcher.py           # Entry point: avvia backend + webview
├── icon.icns             # Icona app (convertita da logo.png)
├── backend/
│   └── main.py           # Backend FastAPI (modificato per path user)
├── frontend/
│   ├── index.html        # Frontend (modificato: CDN rimossi, asset locali)
│   └── logo.png          # Logo app
└── resources/
    └── tailwind.min.css  # TailwindCSS offline (bundled)
```

---

### 2. Launcher (Entry Point)

#### [NEW] [launcher.py](file:///Users/giacomomeschini/Antigravity/Scriver_AI/scriver_AI_app/launcher.py)

Script principale che:
1. Determina `DATA_DIR = ~/Documenti/ScriverAI/` e crea le sottocartelle necessarie
2. Avvia FastAPI/uvicorn in un thread daemon
3. Apre una finestra nativa macOS con `pywebview` puntata al frontend
4. Gestisce lo shutdown pulito (kill uvicorn, stop Ollama)

---

### 3. Modifiche al Backend

#### [MODIFY] [main.py](file:///Users/giacomomeschini/Antigravity/Scriver_AI/backend/main.py)

Modifiche principali:
- **Path dinamici**: `SCRIVER_AI_DATA_DIR` punta a `~/Documenti/ScriverAI/` per l'app packaged, mantenendo il path relativo per lo sviluppo
- **Nuovo endpoint `/hf-token-guide/`**: Restituisce la guida alla creazione del token HF
- **Nuovo endpoint `/available-models/`**: Lista modelli HF compatibili per download
- **Nuovo endpoint `/download-hf-model/`**: Scarica modello specifico da HuggingFace con progresso
- **Nuovo endpoint `/check-first-run/`**: Verifica se è il primo avvio (token HF mancante)
- **Nuovo endpoint `/open-output-folder/`**: Apre la cartella verbali nel Finder
- **Fix import `FileResponse`**: Mancante nel codice attuale (riga 1345)
- **Fix variabile `all_participants_set`**: Non definita a riga 1011 (bug attuale)

---

### 4. Modifiche al Frontend

#### [MODIFY] [index.html](file:///Users/giacomomeschini/Antigravity/Scriver_AI/frontend/index.html)

Modifiche principali:
- **Rimozione CDN Tailwind**: Sostituito con `tailwind.min.css` locale (offline-first)
- **Rimozione Google Fonts CDN**: Embed `Space Mono` come font locale
- **Modale HF Token (First Run)**: Al primo avvio mostra un modale bloccante con:
  - Campo per inserire il token HF
  - Guida step-by-step alla creazione del token su HuggingFace
  - Accettazione licenze pyannote
  - Pulsante "Salva e Continua"
- **Menu Download Modelli**: Nella barra di navigazione, un nuovo pulsante "Modelli AI" che apre un modale con:
  - Lista modelli compatibili (Llama 3.1 8B, Mistral 7B, Gemma 2 9B)
  - Stato download per ciascuno (scaricato/non scaricato)
  - Pulsante per avviare il download di ciascun modello
  - Indicatore progresso download
- **Pulsante "Apri Cartella Verbali"**: Aggiunto nella barra nav per aprire la cartella output direttamente nel Finder
- **Fix duplicato `<h2>Nuova Elaborazione</h2>`**: Riga 398-399, presente 2 volte

---

### 5. Conversione Icona & Build

#### [NEW] [build_app.sh](file:///Users/giacomomeschini/Antigravity/Scriver_AI/scriver_AI_app/build_app.sh)

Script che:
1. Converte `logo.png` → `icon.icns` usando `sips` e `iconutil`
2. Scarica TailwindCSS standalone per uso offline
3. Esegue `py2app` per creare `ScriverAI.app`
4. Crea il `.dmg` con `hdiutil` (stile drag-to-Applications)

#### [NEW] [setup.py](file:///Users/giacomomeschini/Antigravity/Scriver_AI/scriver_AI_app/setup.py)

Configurazione py2app con:
- Inclusione di `backend/`, `frontend/`, `resources/`
- Esclusione esplicita di `ScriverAiData/models/` (no LLM nel .dmg)
- Metadata app (nome, versione, icona)

---

### 6. Funzionalità Aggiuntive Implementate

| Feature | Descrizione |
|---------|-------------|
| **First-run wizard** | Modale HF Token + guida al primo avvio |
| **Model Manager** | Menu per scaricare/gestire modelli Ollama |
| **Open in Finder** | Pulsante per aprire cartella verbali |
| **Path user-friendly** | Output in `~/Documenti/ScriverAI/` |
| **Offline assets** | TailwindCSS e font bundled |
| **Graceful shutdown** | Chiusura pulita di uvicorn e Ollama |
| **Fix bug `all_participants_set`** | Variabile non definita (riga 1011) |
| **Fix `FileResponse` import** | Mancante per endpoint download |
| **Fix `<h2>` duplicato** | Frontend riga 398-399 |

---

## Open Questions

> [!IMPORTANT]
> 1. **Approvi la posizione `~/Documenti/ScriverAI/` per i file di output?** Considerando che dici che devono essere facili da trovare per l'utente.
> 2. **Vuoi che il download dei modelli Ollama (Llama, Mistral, Gemma) sia disponibile dal menu dell'app?** Questo richiede una connessione internet una tantum durante il setup.
> 3. **py2app bundlerà l'intero ambiente Python** (torch, whisperx, spacy, etc.) nel .app. Questo rende l'app autosufficiente ma potrebbe risultare in un file di ~3-4GB. Preferisci questo approccio o un approccio con virtual environment esterno?

---

## Verification Plan

### Automated Tests
1. Verificare che `build_app.sh` generi con successo il `.dmg`
2. Verificare che il `.dmg` non contenga la cartella `models/` (LLM)
3. Verificare che l'app si avvii correttamente dal `.dmg`

### Manual Verification
1. Doppio click su `ScriverAI.app` → finestra nativa si apre
2. Al primo avvio → modale HF Token appare
3. Menu "Modelli AI" → lista modelli disponibili
4. Pulsante "Apri Cartella Verbali" → apre Finder nella cartella corretta
5. Elaborazione audio/testo → output salvati in `~/Documenti/ScriverAI/verbali/`
6. Utilizzo RAM < 16GB durante l'elaborazione completa
