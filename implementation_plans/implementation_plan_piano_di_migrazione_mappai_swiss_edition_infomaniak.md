# Piano di Migrazione: MappAI Swiss Edition (Infomaniak)

L'obiettivo è creare una versione indipendente di MappAI che utilizzi l'infrastruttura AI di **Infomaniak** (modello **Gemma4**) mantenendo la stessa interfaccia e logica funzionale della versione originale.

## User Review Required

> [!IMPORTANT]
> Infomaniak utilizza un formato API compatibile con OpenAI (`messages` invece di `contents`). Dobbiamo assicurarci che il modello Gemma4 rispetti rigorosamente gli schemi JSON richiesti dall'app.

## Proposti Cambiamenti

### Progetto: Mapp_AI_Infomaniak

#### [MODIFY] [package.json](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/package.json)
- Cambiare `name` in `mapp-ai-swiss`.
- Cambiare `productName` in `MappAI Swiss`.

#### [NEW] [infomaniak_bridge.js](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/public/js/infomaniak_bridge.js)
- Creazione di una classe/utility per la trasformazione dei messaggi.
- Mappatura dei `systemInstruction` di Gemini nel primo messaggio `system` di OpenAI.
- Gestione del parametro `response_format: { type: "json_object" }`.

#### [MODIFY] [main.js](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/main.js)
- Aggiunta di un nuovo IPC handler `generate-infomaniak`.
- Logica di routing: se il modello selezionato inizia con `infomaniak/`, usa il nuovo endpoint.

#### [MODIFY] [index.html](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/public/index.html)
- Aggiunta dell'opzione "Infomaniak (Swiss)" nel selettore del provider/modello nel modale di Setup.

## Strategia di Testing

1. **Unit Test Bridge**: Verificare che la trasformazione del payload Gemini -> OpenAI sia corretta.
2. **Integration Test**: Eseguire una generazione di mappa mentale completa usando la chiave API di Infomaniak.
3. **Validazione JSON**: Verificare che l'output di Gemma4 sia compatibile con i parser esistenti in `app.js`.

---

**Sei d'accordo con questa struttura?** Se confermi, inizierò con le modifiche ai file di configurazione e la creazione del bridge.
