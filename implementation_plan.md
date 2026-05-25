# Piano di Implementazione: Aggiornamento UI App iPad Docente

Questo piano descrive i passi per portare le ultime modifiche di stile, layout e logica dell'interfaccia utente (nuova UI) presenti nel branch `MappAI_iPad_studente` all'interno del branch dell'app Docente (`MappAI_iPad`), salvaguardando le configurazioni specifiche del Docente (come `studentMode: false`).

## User Review Required

> [!IMPORTANT]
> - Durante il merge, ripristineremo `studentMode: false` in `public/js/app.js` e verificheremo che la sequenza segreta di sblocco/switch modalità per il docente rimanga funzionante.
> - La build finale verrà verificata compilando l'app Docente per iPad.

## Proposed Changes

### 1. Merge del Branch Studente su Docente
#### [MODIFY] [MappAI_iPad](file:///Users/giacomomeschini/Antigravity/MappAI)
- Esecuzione del merge da `MappAI_iPad_studente` a `MappAI_iPad`.
- Risoluzione di eventuali conflitti su `public/index.html`, `public/js/app.js` e `public/css/style.css`.

### 2. Configurazione Specifica Docente
#### [MODIFY] [app.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/app.js)
- Ripristino della variabile `studentMode: false` all'inizio del file (riga ~35).
- Verifica del corretto ripristino del meccanismo di sblocco con tasti segreti per l'app docente:
  ```javascript
  let studentModeKeys = [];
  const studentModeSecret = ['l', 'k', 'j', 'h'];
  ```

### 3. Sincronizzazione e Build per iPad
#### [BUILD] [Capacitor Sync](file:///Users/giacomomeschini/Antigravity/MappAI)
- Sincronizzazione delle risorse con `npx cap sync ios`.
- Compilazione e installazione su iPad tramite Xcode (`npx cap run ios`).

## Verification Plan

### Automated Tests
- Rigenerazione del grafo di conoscenza tramite `python3 -m graphify update .`.
- Esecuzione dello script di build dell'applicazione per validare la correttezza sintattica.

### Manual Verification
- Controllo su iPad che l'app Docente si avvii correttamente mostrando la nuova UI e mantenendo l'accesso alle funzionalità da docente (pannelli di sblocco e configurazioni).
