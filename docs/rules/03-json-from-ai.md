# Rule 03 — JSON da AI: mai parse diretto

## Regola
Il testo JSON prodotto da un modello AI si interpreta **sempre** con
`window.salvageTruncatedJSON(text)`, **mai** con `JSON.parse(text)` diretto.

## Perché
I modelli (soprattutto open source su Infomaniak) producono JSON:
- con blocchi markdown ```` ```json ```` attorno;
- con chiavi non quotate, virgole finali (trailing commas);
- **troncati** quando esauriscono il budget token.

`salvageTruncatedJSON` esegue pre-pulizia (markdown, chiavi, virgole) e un'estrazione
bilanciata delle parentesi per recuperare il massimo oggetto/array valido anche da output
troncato. `JSON.parse` diretto lancia e fa perdere **tutta** la risposta.

## Fai
```js
const raw  = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
const data = window.salvageTruncatedJSON(raw);   // robusto a markdown/troncamenti
if (!data) { /* gestisci fallimento */ }
```

## Non fare
```js
const data = JSON.parse(raw);   // ❌ esplode su markdown, trailing comma o troncamento
```

## Casi particolari
- **JSONL** (una riga = un oggetto, usato in Fase 3 ramo): usare `window.parseJSONLResponse`.
- In **single-pass** (es. KG Community) un JSON rotto perde tutto il risultato → la pulizia
  JSON è prioritaria, non opzionale.

## Riferimenti
- `salvageTruncatedJSON` — `public/js/app.js` (~riga 4095)
- `_extractBalancedJSON` (helper) — `public/js/app.js` (~riga 4057)
- `parseJSONLResponse` — `public/js/app.js` (~riga 4266)
- Rilevamento troncamento: `_detectTruncation` (~riga 1951) → vedi Rule 05

## Direzione (migrazione)
Candidato **Tier 1** all'estrazione in `mappai-json-salvage.js`: è un parser **puro**,
ad alto valore, perfetto per una suite di test con fixture di JSON malformati/troncati.
