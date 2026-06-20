# Rule 06 — Moduli & estrazione incrementale

## Regola (stato attuale)
- I moduli `public/js/mappai-*.js` sono **script globali** (espongono `window.*`), **non**
  ES modules. Niente bundler a runtime.
- Usano funzioni esposte da `app.js` (`window.cleanLabel`, `window.getNodeColor`,
  `window.showToast`, `window.renderGraph`, `EDGE_FAMILIES`, ecc.).

### Ordine di caricamento — due categorie
1. **Moduli che DIPENDONO da app.js** (la maggioranza: usano `window.renderGraph`,
   `EDGE_FAMILIES`, ecc. **a runtime**): caricati **dopo** `app.js` e **prima** di
   `admin_prompts.js`. Esempi: `mappai-active-study.js`, `mappai-timeline.js`.
2. **Moduli PURI da cui app.js dipende** (Tier 1: utility senza dipendenze): caricati
   **PRIMA** di `app.js`, perché app.js fa binding/delega a loro **al momento del load**
   (es. `const EDGE_FAMILIES = window.MappAIRelations.EDGE_FAMILIES;`). Esempi già estratti:
   `mappai-text-utils.js`, `mappai-json-salvage.js`, `mappai-math.js`, `mappai-relations.js`.

Regola pratica: se app.js **usa** il modulo → il modulo va prima; se il modulo **usa** app.js
→ il modulo va dopo.

## Direzione (migrazione verso codebase pulita)
Il monolite `public/js/app.js` (~16.000 righe) va scomposto con il pattern **Strangler Fig**:
estrarre funzioni in moduli isolati e testabili, **una alla volta**, mantenendo l'app
spedibile a ogni passo. Il modello di riferimento è `infomaniak_bridge.js` (funzioni pure,
IO isolato, documentato).

### Ordine di estrazione
1. **Tier 1 — pure, rischio zero**: `mappai-text-utils.js` (cleanLabel, stripHTML…),
   `mappai-json-salvage.js` (salvage), `mappai-math.js` (cosineSimilarity),
   `mappai-relations.js` (EDGE_FAMILIES + getEdgeFamilyKey).
2. **Tier 2 — coeso, con cura**: `mappai-ai-client.js` (fetchModelAPI + bridge + provider),
   `mappai-generation.js`, `mappai-tutor.js`, `mappai-accessibility.js`, `mappai-profiles.js`,
   `mappai-study.js`.
3. **Tier 3 — per ultimo**: rendering D3 (`renderGraph`, `tick`, `drag`) — accoppiato a stato
   globale mutabile.

## Strategia di test a flag temporaneo
Per le funzioni a rischio: estrai nel modulo, **tieni la vecchia**, fai A/B con un flag
`localStorage`.
```js
function salvageTruncatedJSON(txt) {
    if (localStorage.getItem('mappai_use_extracted_json') === 'true') {
        return window.MappAIJsonSalvage.salvage(txt);   // nuovo modulo
    }
    return _legacySalvage(txt);                          // vecchio, intatto
}
```
Verificare il nuovo modulo su dati reali con il flag ON per N sessioni, poi rimuovere il legacy.
Per le funzioni **pure** (Tier 1) si salta il flag: estrazione + delega diretta, rischio nullo,
bastano i test isolati.

## Convenzioni nuovo modulo
- Nome `mappai-<area>.js`, namespace `window.MappAI<Area>` (PascalCase) o `window.<verbo>` coerente.
- Niente dipendenze da DOM nei moduli "logica pura" (testabili headless).
- Documentare in testa: scopo, dipendenze (`window.*` usate), ordine di caricamento.
- Aggiornare l'ordine `<script>` in `index.html`.

## Non fare
- ❌ Big-bang rewrite: estrazione incrementale, app sempre funzionante.
- ❌ Introdurre ES modules/bundler sul codice **vecchio** in un colpo solo (solo sul nuovo, gradualmente).
- ❌ Spostare una funzione senza aggiornare i suoi consumatori e l'ordine in `index.html`.
