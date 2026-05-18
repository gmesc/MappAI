# Modular AI API Bridge (MappAI)

## 1. Gestione dei Provider
L'applicazione supporta un'architettura a doppio provider dinamico gestito via IPC Main:
- **Google Gemini**: Richieste dirette REST all'endpoint `v1beta/models`.
- **Infomaniak (Gemma 4)**: Richieste proxy autenticate con Bearer Token all'endpoint `api.infomaniak.com/2/ai/{product_id}/openai/v1`.

## 2. Prevenzione dei Timeout (Streaming obbligatorio)
- Per le richieste a Infomaniak, forzare sempre il parametro `stream: true` nel payload.
- Gestire la ricostruzione dello stream a blocchi (`chunk.toString().split('\n')`) all'interno dell'IPC handler di Electron per evitare i Gateway Timeout (504) tipici delle mappe complesse a singola chiamata sincrona.

## 3. Gestione della Licenza Algoritmica (Machine ID)
- Mantenere e proteggere l'algoritmo di sblocco basato sull'indirizzo MAC e sul modello CPU criptato in SHA-256 (`get-machine-id`) per garantire il funzionamento sicuro delle funzionalità avanzate dell'app offline.
