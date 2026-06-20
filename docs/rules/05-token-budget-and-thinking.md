# Rule 05 — Token budget & thinking (Google Gemini)

## Regola
La gestione di `maxOutputTokens`, del "thinking" e dei limiti di schema segue soglie precise
e **non intuitive**. Cambiarle alla cieca reintroduce troncamenti già risolti.

## maxOutputTokens
- Si ricava da `window.getMaxOutputTokens(base)` (~riga 1871): applica un fattore (es. ×2 per
  `gemini-2.5`) con cap, e ha un **fallback su localStorage** per il rilevamento del modello
  quando il DOM è `null` (può capitare nel loop dei rami).
- Non hardcodare `maxOutputTokens`: passare sempre da `getMaxOutputTokens`.

## Thinking (gemini-2.5 / gemini-3)
Regola di iniezione `thinkingConfig` in `fetchModelAPI`:
```
provider = google
AND model ~= gemini-2.5 | gemini-3
AND maxOutputTokens > 0
AND maxOutputTokens <= 12288
→ inietta thinkingConfig: { thinkingBudget: 0 }   // thinking DISABILITATO
```
- Sotto soglia (≤ 12288): thinking **off** (fasi MindMap multi-pass, Phase 4/5 testuali).
- Sopra soglia (es. KG Community ~16000): thinking **preservato**.
- La soglia 12288 copre la Phase 3 ramo a 8192 (4096×2) con margine.

## maxItems sugli schema array (CRITICO)
Uno **schema array senza `maxItems`** fa sì che il modello riempia l'array fino al budget
token esatto (riprodotto: budget 6000/8192/12000 → 5988/8180/11988 token) e **tronchi**.
- Su `schemaL1` (Fase 1 MindMap) `maxItems: 7` è **obbligatorio**.
- `maxLength` sui singoli campi **non basta**: limita le stringhe, non il numero di elementi.

## Rilevamento troncamento
- `_detectTruncation` (~riga 1951) verifica `finishReason` e la chiusura del JSON.
- A valle, il recupero passa comunque da `salvageTruncatedJSON` (Rule 03).

## Riferimenti
- `getMaxOutputTokens` — `public/js/app.js` (~riga 1871)
- `_detectTruncation` — `public/js/app.js` (~riga 1951)
- `fetchModelAPI` (iniezione thinking) — `public/js/app.js` (~riga 1959)

## Non fare
- ❌ Definire uno schema array senza `maxItems` quando il numero di elementi è limitato.
- ❌ Alzare `maxOutputTokens` oltre 12288 "per sicurezza" senza valutare l'effetto sul thinking.
