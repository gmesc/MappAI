# Rule 02 — Bridge Infomaniak

## Regola
La conversione payload/risposta **Gemini ↔ OpenAI** per Infomaniak avviene **solo** in
`window.InfomaniakBridge`. Nessun'altra parte del codice costruisce payload OpenAI.

## Vincoli del bridge (conoscenza nascosta)
`InfomaniakBridge.translatePayload(geminiPayload, modelName)`:

- **`systemInstruction` + `contents`** → array `messages` (`role: model` → `assistant`).
- **`temperature` è hardcoded a `0.3`** → il valore in `generationConfig.temperature` viene
  **ignorato**. Non affidarsi alla temperatura per Infomaniak.
- **`frequency_penalty: 0.3`, `presence_penalty: 0.1`** → ridotti apposta per non penalizzare
  il JSON ripetitivo (nodi/link).
- **JSON mode nativo (`response_format: json_schema`)**: abilitato **solo** per i modelli che
  lo supportano davvero → **Gemma 4** e **Kimi**. Per **Apertus** (niente function calling) e
  **Qwen** (risponde vuoto con `json_schema`) il bridge inietta invece **regole testuali
  tassative** in coda all'ultimo messaggio (schema d'esempio + "rispondi solo JSON, niente
  markdown, primo carattere `{` o `[`").
- **Qwen** è un modello reasoning: il bridge forza `chat_template_kwargs.enable_thinking: false`
  perché altrimenti spende il budget token nel "pensare" e svuota l'output.
- **Parti multimediali** (`inline_data`, `file_data`): **scartate**. Infomaniak non supporta
  audio/video/immagini nativi → viene inviato solo il testo estratto, con warning a console e toast.

`InfomaniakBridge.translateResponse(openAIResponse)`:
- Riconverte `choices[0].message.content` → struttura Gemini (`candidates[].content.parts[].text`)
  così il resto dell'app vede sempre la stessa forma.

## Implicazioni pratiche
- Per Infomaniak **non** dare per scontato che `responseMimeType: "application/json"` o
  `responseSchema` funzionino: dipende dal modello. Il fallback testuale è normale.
- Se un modello Infomaniak risponde vuoto o con preamboli, la causa è quasi sempre qui:
  controllare `supportsJsonMode` e il ramo fallback.
- Lo **streaming SSE è obbligatorio** per Infomaniak (bypassa il Gateway Timeout) — gestito
  a monte in `fetchModelAPI`.

## Riferimenti
- `public/js/infomaniak_bridge.js` (intero, ~185 righe) — già modulo pulito, **usare come
  modello** per le estrazioni future.

## Non fare
- ❌ Aggiungere logica provider-specifica Infomaniak fuori dal bridge.
- ❌ Assumere che `temperature` o `responseSchema` vengano rispettati su tutti i modelli.
