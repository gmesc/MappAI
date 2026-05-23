# Piano di Implementazione - Rimozione Share Sheet iOS e Calibrazione Costi Gemma 4

Questo piano descrive le modifiche apportate per semplificare il salvataggio dei Vault locali su iOS ed allineare la stima dei costi del modello google/gemma-4-31b-it (Infomaniak) a quelli reali riscontrati in produzione.

## Modifiche Proposte

### 1. Semplificazione Esportazione Vault su iPadOS
Attualmente, su Capacitor (iPad), quando l'utente sceglie di esportare un Vault, l'applicazione apre lo Share Sheet nativo di iOS (`navigator.share`). Questo menu nativo risulta ambiguo e poco chiaro per l'utente.
* **Soluzione**: Rimuovere la chiamata a `navigator.share` in `saveVault` all'interno di `public/js/storageAdapter.js`. In questo modo, l'utente inserisce il nome desiderato per il Vault tramite il prompt, e il Vault viene salvato direttamente nella cartella dell'applicazione (`Directory.Documents/MappAI - Vault/${nome_vault}`) nel filesystem locale dell'iPad in modo trasparente e automatico, registrandosi anche in `vaults_index.json`.

### 2. Calibrazione e Allineamento Costi Gemma 4 (Infomaniak)
I costi stimati per il modello Gemma 4 erano configurati a zero o sovrastimati a causa di una fall-back automatica sui costi Gemini.
* **Modifiche in `public/js/app.js`**:
  * Aggiornare `MODEL_KB` associando ai modelli `gemma-4`, `gemma`, `google/gemma-4`, e `google/gemma` la tariffa reale di Infomaniak: **inputCost: 0.20** CHF per milione di token, **outputCost: 0.40** CHF per milione di token, impostando il tier corretto su `'🇨🇭 Swiss Made'`.
  * Modificare `window.updateCostDisplay` per usare i costi specifici ricavati da `matchModelKB()` anziché tariffe hardcoded e mostrare l'unità di misura in `CHF` se il provider attivo è Infomaniak.
  * Aggiornare `window.showGenerationReport` per formattare e mostrare i costi stimati in `CHF` per il provider Infomaniak.
* **Modifiche in `public/js/storageAdapter.js`**:
  * Allineare i valori di `inputCost` e `outputCost` restituiti nel campo `kb` della funzione `listInfomaniakModels` a `0.20` e `0.40` rispettivamente.
* **Modifiche sul Sito Web (`insegnai_sito/guida-infomaniak.html`)**:
  * Ricalibrare i calcoli di convenienza del limite di spesa di 20 CHF/mese e la tabella dei costi medi per singola operazione (Chat, Quiz/Flashcard, Mappe Concettuali) basandosi sui parametri reali riscontrati (es. ~0.0012 CHF per mappa concettuale, ~0.0010 CHF per Quiz).

---

## Modifiche ai File

### [MODIFY] [storageAdapter.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/storageAdapter.js)
* Rimozione di `navigator.share` in `saveVault` per Capacitor.
* Aggiornamento costi modelli a 0.20 (input) e 0.40 (output) in `listInfomaniakModels`.

### [MODIFY] [app.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/app.js)
* Aggiornamento tariffe e chiavi in `MODEL_KB`.
* Calcolo dinamico in `updateCostDisplay` e supporto valuta `CHF`.
* Supporto valuta `CHF` in `showGenerationReport`.

### [MODIFY] [guida-infomaniak.html](file:///Users/giacomomeschini/Antigravity/insegnai_sito/guida-infomaniak.html)
* Ricalibrazione stime e tabella costi in base a metriche reali.

---

## Piano di Verifica

### Verifica Funzionale
1. Avviare l'applicazione e selezionare "Esporta Vault". Verificare che venga chiesto solo il nome e che il salvataggio locale avvenga senza l'apparizione dello Share Sheet iOS.
2. Eseguire una generazione con Infomaniak Gemma 4 e verificare che il costo stimato a fine operazione e nella barra inferiore sia mostrato in `CHF` con valori coerenti (es. circa `0.0012 CHF` per la mappa generata).
3. Aprire il file `guida-infomaniak.html` e verificare la correttezza visiva della tabella ricalibrata.
