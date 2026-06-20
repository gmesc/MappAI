# Guida alla Migrazione API: Da Google Gemini a Infomaniak (Gemma4)

Questo documento descrive le specifiche tecniche dell'integrazione AI attuale di MappAI per facilitare la migrazione verso il provider svizzero **Infomaniak** utilizzando il modello **Gemma4**.

## 1. Architettura della Richiesta Attuale

MappAI utilizza l'API **Google Gemini (v1beta)**. La logica è centralizzata nella funzione `fetchModelAPI` (`public/js/app.js`) che comunica con il processo Main di Electron tramite IPC.

### Endpoint Gemini
- **URL**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}`
- **Metodo**: `POST`
- **Header**: `Content-Type: application/json`

### Struttura del Payload (Request)
Il payload inviato rispetta lo standard Gemini:

```json
{
  "systemInstruction": {
    "parts": [
      { "text": "Istruzioni di sistema (System Prompt)..." }
    ]
  },
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "Input dell'utente o testo da analizzare..." }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.2,
    "responseMimeType": "application/json",
    "responseSchema": { ... } 
  }
}
```

> [!NOTE]
> Il campo `responseSchema` è fondamentale per ricevere output JSON strutturati e validabili. Se il nuovo provider (Infomaniak) non supporta lo schema nativo nel payload, sarà necessario forzare il formato tramite prompt engineering.

---

## 2. Struttura della Risposta (Response)

MappAI si aspetta che la risposta API segua questa struttura gerarchica:

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "{ \"nodes\": [...], \"links\": [...] }" 
          }
        ]
      },
      "finishReason": "STOP"
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 123,
    "candidatesTokenCount": 456,
    "totalTokenCount": 579
  }
}
```

### Logica di Parsing
Il frontend estrae il testo tramite: `data.candidates[0].content.parts[0].text`. Se l'output è JSON, viene passato a `JSON.parse()`.

---

## 3. Schemi di Output Mandatori

Per il corretto funzionamento di MappAI, il modello deve restituire JSON validi secondo questi schemi specifici a seconda dell'operazione.

### A. Mappa Mentale / Knowledge Graph (Struttura Base)
Utilizzato per la generazione dei rami e dei grafi completi.

```json
{
  "nodes": [
    {
      "id": "ID_UNIVOCO_MAIUSCOLO",
      "label": "Nome Breve",
      "content": "Frase concisa (max 10 parole)",
      "desc": "Paragrafo dettagliato (250-300 parole)",
      "level": 1,
      "chunks": ["Citazione 1", "Citazione 2"]
    }
  ],
  "links": [
    {
      "source": "ID_ORIGINE",
      "target": "ID_DESTINAZIONE",
      "rel": "Relazione (es: include, causa)"
    }
  ]
}
```

### B. Quiz e Flashcards
Utilizzato per la generazione automatica dei test.

```json
[
  {
    "q": "Domanda?",
    "a1": "Opzione 1",
    "a2": "Opzione 2",
    "a3": "Opzione 3",
    "correct": 3
  }
]
```

---

## 4. Considerazioni per Infomaniak / Gemma4

Nel migrare verso Infomaniak, tieni presente i seguenti punti:

1. **Compatibilità OpenAI**: Spesso i provider alternativi espongono API compatibili con lo standard OpenAI (`/v1/chat/completions`). In tal caso, il payload dovrà essere trasformato (es. `messages` invece di `contents`).
2. **JSON Mode**: Assicurati che Infomaniak supporti il "JSON Mode" per garantire che Gemma4 non restituisca testo discorsivo fuori dal blocco JSON.
3. **Token Usage**: MappAI usa `usageMetadata` per calcolare i costi in tempo reale nella dashboard. Verifica come Infomaniak restituisce l'utilizzo dei token (solitamente nel campo `usage`).
4. **Pedagogia Socratica**: Il Tutor Socratico richiede basse temperature (0.2 - 0.3) per evitare allucinazioni e mantenere il rigore didattico.

> [!TIP]
> Se desideri che io prepari un bridge software (`provider_infomaniak.js`), posso implementare un convertitore di protocollo che renda la migrazione trasparente per il resto dell'applicazione.
