# Rule 01 — AI client: un solo choke point

## Regola
Ogni chiamata a un modello AI passa **esclusivamente** da `window.fetchModelAPI(payload, apiKey)`.
Il `payload` è **sempre** in forma Gemini, indipendentemente dal provider attivo.

## Perché
`fetchModelAPI` è l'unico punto che:
- sceglie il provider attivo (`appState.aiProvider`: `google` | `infomaniak`);
- per Infomaniak invoca `window.InfomaniakBridge.translatePayload` (vedi Rule 02);
- gestisce streaming SSE, timeout, rilevamento troncamento.

Chiamare un provider HTTP direttamente **bypassa** bridge, gestione errori e
astrazione provider → rompe il supporto multi-provider e duplica logica fragile.

## Fai
```js
const apiKey = window.getSystemKey();           // legge la chiave del provider attivo
if (!apiKey) { window.showToast("Inserisci API Key", "error"); return; }

const payload = {
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
};
const response = await window.fetchModelAPI(payload, apiKey);
const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
```

## Non fare
- ❌ `axios.post('https://generativelanguage.googleapis.com/...')` o fetch diretto a un provider.
- ❌ Costruire payload in forma OpenAI (`messages`) nel codice applicativo — la conversione
  è responsabilità **solo** del bridge.
- ❌ `JSON.parse` diretto sul testo della risposta → vedi Rule 03.

## Riferimenti
- `fetchModelAPI` — `public/js/app.js` (~riga 1959)
- `getSystemKey` — `public/js/app.js` (~riga 1855)
- `getMaxOutputTokens` — `public/js/app.js` (~riga 1871) → vedi Rule 05

## Direzione (migrazione)
Estrarre `fetchModelAPI` + selezione provider + `getSystemKey` in un modulo
`mappai-ai-client.js`, mockabile nei test. È il candidato Tier 2 a più alto valore
per testabilità e onboarding.
