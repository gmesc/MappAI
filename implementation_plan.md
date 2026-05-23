# Rimozione Pulsanti Ridondanti ed Estimatore Costi & Token in Tempo Reale

Questo piano descrive le modifiche necessarie per:
1. Rimuovere i pulsanti duplicati e obsoleti in fondo alla landing page ("Importa JSON" e "Guida AI Esterna" con rispettivo modale).
2. Sostituire il pulsante "Crea canvas vuoto (Manuale)" con un pannello informativo dinamico che mostra in tempo reale:
   - Numero di token del documento in input (stima heuristica basata sui caratteri).
   - Limite massimo di token del modello AI selezionato.
   - Costo stimato della generazione in base alla dimensione dell'input e al numero di nodi/livelli scelti tramite gli slider.

## User Review Required

> [!IMPORTANT]
> - **Rimozione di "Crea canvas vuoto (Manuale)"**: Questo pulsante viene rimosso dal fondo del form di configurazione poiché è un doppione dell'azione rapida "Nuovo Progetto" presente all'inizio della landing page (entrambi creano un progetto vuoto).
> - **Input dei file preservato**: Pur rimuovendo l'etichetta di importazione inferiore, l'input file nascosto `#landing-import` rimarrà attivo per non interrompere il funzionamento del pulsante "Importa JSON" in cima alla pagina.
> - **Stima del costo**: L'algoritmo stimerà i token di output moltiplicando il numero teorico di nodi generati per 120 token (MM) o 150 token (KG), applicando i prezzi al milione di token definiti nella configurazione `MODEL_KB` per i modelli a pagamento, o mostrando "Gratuito" per i modelli Free.

## Open Questions

> [!NOTE]
> - La valuta utilizzata per la stima sarà espressa in centesimi di dollaro USD (¢).
> - Se il costo stimato è inferiore a 0.01 ¢, mostreremo <0.01 ¢ per evitare costantemente valori a zero per testi molto corti.

## Proposed Changes

## Proposed Changes

### Translations

#### [MODIFY] [it_translations.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/traduzioni/it_translations.js)
* Aggiungere nuove etichette per l'estimatore:
  - `estimator_title`: "Analisi Documento & Stima Costi"
  - `estimator_tokens_label`: "Input / Max Modello"
  - `estimator_cost_label`: "Costo Stimato"
  - `estimator_free`: "Gratuito"

#### [MODIFY] [en_translations.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/traduzioni/en_translations.js)
* Aggiungere le stesse chiavi localizzate in inglese.

---

### UI & Layout

#### [MODIFY] [index.html](file:///Users/giacomomeschini/Antigravity/MappAI/public/index.html)
* Rimosso il codice HTML di `#external-json-modal` (Modale Istruzioni JSON Esterno).
* Rimosso il pulsante "Guida AI Esterna" e l'etichetta duplicata "Importa JSON" in fondo al form.
* Rimossa la barra di conteggio dei token provvisoria `#token-counter-container`.
* Sostituito il tag `<button onclick="window.createBlankCanvas()">` con il nuovo pannello informativo `#token-cost-estimator-card` composto da:
  - Titolo dell'analisi
  - Visualizzazione token caricati rispetto alla finestra di contesto del modello selezionato
  - Costo stimato
  - Barra di progresso colorata (verde/giallo/rosso) che indica la saturazione del contesto del modello.

#### [MODIFY] [style.css](file:///Users/giacomomeschini/Antigravity/MappAI/public/css/style.css)
* Rimosse le regole CSS relative a `createBlankCanvas()`, `openExternalJSONInstructions()` e al vecchio `#token-counter-container`.

---

### Logic & Controllers

#### [MODIFY] [app.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/app.js)
* Rimozione delle funzioni obsolete:
  - `window.createBlankCanvas`
  - `window.openExternalJSONInstructions`
  - `window.closeExternalJSONModal`
  - `window.copyExternalPrompt`
* Implementazione della funzione globale `window.updateTokenCostEstimator()`:
  - Determina il modello attualmente selezionato ed estrae la finestra di contesto (es. 1.048.576 per Gemini 2.0 Flash, 2.097.152 per 1.5 Pro, 8.192 per Gemma).
  - Somma i caratteri inseriti nelle textarea e nei file caricati in `appState.sources` e stima i token di input (caratteri / 4).
  - Estrapola i token di output attesi in base alla modalità (MM o KG) e allo slider di densità o numero di nodi.
  - Calcola il costo basandosi sulle tariffe al milione presenti in `MODEL_KB`.
  - Aggiorna i testi del pannello e la barra di progresso dell'indicatore.
* Integrazione dell'estimatore:
  - Invocazione in `updateTokenCounter()` affinché si aggiorni ad ogni inserimento fonti.
  - Invocazione in `setMode()` e `changeLanguage()`.
  - Collegamento dell'evento `change` a `#model-select` su DOMContentLoaded per aggiornare le stime al cambio del modello AI.

## Verification Plan

### Automated Tests
* Nessuno.

### Manual Verification
1. Aprire la landing page.
2. Verificare che i bottoni duplicati in fondo a destra e il pulsante manuale siano spariti e sostituiti dal nuovo pannello di analisi dei token.
3. Caricare un file di testo/PDF e verificare che il contatore indichi i token stimati corretti.
4. Cambiare modello tra uno Free (es. `gemini-2.0-flash`) e uno a pagamento (es. `gemini-2.5-pro`) verificando l'adeguamento del limite massimo dei token e del costo stimato.
5. Muovere gli slider di densità (MM) o numero nodi (KG) e accertare che la stima del costo si aggiorni dinamicamente in base alle dimensioni impostate.
6. Eseguire `npx cap copy` per sincronizzare il build iOS.
