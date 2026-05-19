# iPad (Capacitor) Migration Protocol (MappAI)

## 1. Sicurezza e Branching (Vibe Coding)
- **Isolamento del Codice:** Tutte le modifiche per rendere l'app compatibile con iPadOS devono avvenire esclusivamente nel branch dedicato (es. `feature/ipad-port`).
- Non alterare la stabilità della versione desktop (main branch) durante i test e la migrazione.

## 2. Pattern Adattatore per l'IPC (Inter-Process Communication)
- Su iPadOS non esiste `window.electronAPI` né il processo di backend Node.js (`main.js`).
- **Adapter Pattern:** Qualsiasi operazione di sistema (lettura/scrittura file) dal frontend non deve chiamare direttamente Electron, ma deve passare attraverso un file adattatore centrale (es. `storageAdapter.js`).
- L'adattatore si occuperà di verificare l'ambiente e instradare la richiesta verso l'IPC di Electron o verso i plugin nativi di Capacitor (come `@capacitor/filesystem` per l'iPad).

## 3. Gestione Storage tramite Capacitor
- I salvataggi e le letture su iPad devono utilizzare le directory native e sicure del dispositivo (es. `Directory.Documents`) utilizzando l'API di `@capacitor/filesystem`.
- Garantire che i dati strutturati vengano gestiti correttamente come stringhe/JSON e gestire in modo resiliente l'assenza temporanea di file locali (es. primo avvio dell'app su un nuovo dispositivo iPad).
- **Importante:** Non tentare di importare o usare moduli core di Node (`fs`, `path`) all'interno del frontend web quando si opera per Capacitor.

## 4. Adattamento UI/UX per Dispositivi Touch
- I listener di eventi pensati unicamente per il mouse (es. click destro, double click e hover) devono essere aggiornati o affiancati da eventi touch nativi, per supportare le gesture dell'iPad.
- Esempi pratici: un menu contestuale da "tasto destro" deve poter essere attivato anche tramite "tap prolungato". Lo zoom deve supportare il "pinch-to-zoom" oltre alla rotella del mouse.
