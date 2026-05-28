# Piano di Implementazione: Fix Edit Contenuto e Restyling Modali

Questo piano descrive il ripristino del funzionamento del tasto "Edit Contenuto" e l'adeguamento grafico degli header di tutti i modali.

## Modifiche Proposte

### `public/js/app.js`
- Modificare l'evento `onclick` del pulsante "Edit Contenuto" nel menu contestuale per passare l'azione `'edit'` corretta invece di `'edit-3'`.

### `public/index_classi_nuove_modifiche_manual.html`
- Uniformare tutti i modali (`study-config-modal`, `vault-manager-modal`, `edit-node-modal`, `contextual-ai-extension-modal`, `quiz-modal`, `study-player-modal`) introducendo:
  - Icona gigante con classe `w-16 h-16` all'inizio dell'header.
  - Pulsante di chiusura "X" posizionato in alto a destra in modo assoluto (`absolute top-8 right-8`).
  - Rimozione dei vecchi header con pulsante "X" inline.

## Verifica
- Avvio dell'app e test di apertura modali da menu contestuale e altre azioni rapide.
