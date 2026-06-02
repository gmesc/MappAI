# Decouple Modal Translations from CSS

L'obiettivo è separare la struttura HTML (con le sue classi Tailwind) dalla logica di traduzione all'interno dei modali "Guida" e "Studio", spostando il markup da `app.js` a `index_classi_nuove_modifiche_manual.html`.

## Proposed Changes

### `public/index_classi_nuove_modifiche_manual.html`
- **Modale Studio (`#study-modal-content`)**: Inseriremo l'HTML completo per le 6 tecniche di studio direttamente in questo div, utilizzando gli attributi `data-i18n` per agganciare i testi (es. `data-i18n="study_sr_title"`).
- **Modale Guida (`#guide-modal-content`)**: Creeremo due blocchi `div` interni:
  - `<div id="guide-normal-content">`: conterrò l'HTML per la modalità standard (7 step).
  - `<div id="guide-student-content" class="hidden">`: conterrò l'HTML per la modalità studente (3 step).
  Entrambi useranno gli attributi `data-i18n`.

### `public/js/app.js`
- Rimuoveremo le sezioni di codice che iniettano stringhe HTML tramite `.innerHTML` in `studyContainer` e `guideContainer`.
- Sostituiremo la logica del `guideContainer` con un semplice toggle di classi CSS:
  - Se `appState.studentMode` è vero, mostreremo `#guide-student-content` e nasconderemo `#guide-normal-content`.
  - Viceversa per la modalità standard.
- Assicurarsi che la funzione globale di traduzione (es. `setLanguage` o il loop `data-i18n`) continui a funzionare senza dover ricaricare l'HTML.

## User Review Required
> [!NOTE]
> Sei d'accordo con questo approccio? Renderà l'HTML molto più pulito e ti permetterà di modificare le classi Tailwind dei modali direttamente nel file HTML, senza dover mai toccare il codice JavaScript. Procedo?
