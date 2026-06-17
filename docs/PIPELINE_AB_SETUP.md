# Pipeline A/B Toggle Configuration

## Implementazione completata (11 giugno 2026)

### Modifiche UI
- **Nascoste le Lenses di estrazione**: il bottone "Personalizza extraction lenses" è stato nascosto con classe `hidden` in `index.html:781`
- **Aggiunto toggle A/B**: nuovo elemento di controllo tra il toggle Multi-Pass e il bottone "Genera Mappa" (`index.html:890-906`)
  - Bottone A: pipeline atomic-suggestions (con semantic dedup)
  - Bottone B: pipeline structural-suggestions (semplificata)

### Modifiche JavaScript (app.js)

#### 1. State Management
- Aggiunto campo `generationPipeline` a `appState` (line 39)
- Valore di default: lettura da `localStorage.getItem('mappai_generation_pipeline')` || `'A'`

#### 2. Funzioni esposte su window
- `window.setPipeline(mode)` — aggiorna stato, UI, localStorage e mostra toast
- `window.getPipeline()` — legge il valore corrente da appState o localStorage

#### 3. Inizializzazione al boot
- Caricamento del pipeline salvato al startup (line ~13377)
- Aggiunta descrizione visiva della pipeline attiva nel pannello UI

#### 4. Logging in startGeneration
- Aggiunto log all'inizio di `startGeneration()` che mostra:
  - Pipeline attiva (A o B)
  - Provider attivo (google o infomaniak)
  - Modalità estrazione (mindmap o kg)

## Come funziona il toggle

1. **Interfaccia**: pannello dedicato nella sezione di setup
   ```
   [Pipeline Generazione]
   Scegli l'algoritmo di generazione mappe
   ┌─────────────────────────┐
   │ A [selezionato] │ B     │
   └─────────────────────────┘
   ```

2. **Persistenza**: localStorage key = `mappai_generation_pipeline` (valore: `'A'` o `'B'`)

3. **Feedback visivo**:
   - Bottone attivo: sfondo bianco, testo indigo-600
   - Bottone inattivo: testo slate-500
   - Descrizione dinamica che cambia in base alla scelta

## Prossimi step: integrazione pipeline-specific logic

Attualmente il toggle è visibile e funzionale, ma il routing verso codici diversi dei due branch va ancora implementato. Due approcci:

### Opzione 1: Feature flags per comportamenti specifici (raccomandato)
Se le differenze tra A e B sono limitate a pochi comportamenti (es. enableSemanticDedup, semanticDedupProvider, ecc.):
```javascript
// In startGeneration o altre funzioni critiche:
if (appState.generationPipeline === 'B') {
    // Disabilita semantic dedup
    localStorage.removeItem('mappai_semantic_dedup_enabled');
} else {
    // Abilita semantic dedup come di default
}
```

### Opzione 2: Versioni separate di funzioni critiche (se differenze sono profonde)
Se A e B hanno logiche completamente diverse in `extractMindmapMultiPass`, `extractKnowledgeGraphSinglePass`, ecc.:
```javascript
window.startGeneration = async function () {
    const pipeline = window.getPipeline();
    
    if (pipeline === 'A') {
        return await window.startGenerationPipelineA();
    } else {
        return await window.startGenerationPipelineB();
    }
}
```

## Stato attuale per test

Il toggle è **completamente funzionale**. Puoi testare:
1. Cliccare A/B e verificare che il bottone si aggiorna visivamente
2. Caricare la pagina in un'altra finestra: il toggle ricorda la scelta precedente
3. Aprire console dev (F12) e controllare i log durante generazione:
   ```
   [Generation Start] Pipeline: A | Provider: google | Mode: mindmap
   ```

## Branch di riferimento

- **Pipeline A**: `experiment/atomic-suggestions`
  - Contiene: semantic dedup (gemini-embedding-001 su Google o bge-multilingual-gemma2 su Infomaniak)
  - File: `public/js/mappai-suggestions-panel.js` (pannello suggerimenti)

- **Pipeline B**: `feat/structural-suggestions` (o `feat/structural-suggestions-GEMINI-lavora-bene`)
  - Contiene: versione semplificata, semantic dedup solo Infomaniak
  - Rimuove: `mappai-suggestions-panel.js`, `prototype-graphology-betweenness.js`
  - Focus: robustezza su Google Gemini (no embedding Google)

## Comandi da console (dopo boot)

```javascript
// Leggi pipeline corrente
window.getPipeline()

// Cambia pipeline (per testing)
window.setPipeline('A')
window.setPipeline('B')

// Verifica appState
appState.generationPipeline
```

## Note per debugging

- Check localStorage: `localStorage.getItem('mappai_generation_pipeline')`
- Ogni volta che clicchi il toggle, apparirà un toast con conferma
- Il cambio pipeline non richiede reload della pagina
- La prossima generazione userà la pipeline selezionata
