# Potenziamento dei Knowledge Graph (KG) tramite Context Window e Parametri Rinforzati

Questo piano d'azione illustra come estendere la capacità di generazione dei Knowledge Graph (KG) sfruttando al massimo la context window di Gemma 4 (fino a 8192 token di output) e rinforzando i parametri strutturali ed estrattivi per ottenere grafi reticolari molto più ricchi, densi e dettagliati, preservando l'eccellente qualità attuale delle relazioni.

## User Review Required

> [!IMPORTANT]
> Aumentando i token di output a **8192** e il numero di nodi a **20-30**, l'IA avrà abbastanza spazio per tessere connessioni trasversali incredibilmente fitte. Questa soluzione mantiene intatta l'architettura matematica attuale (i Super-Hub a Livello 1, le relazioni a Livello 2), ma ne moltiplica i dettagli e l'accuratezza pedagogica.

---

## Open Questions

> [!IMPORTANT]
> 1. **Budget dei Nodi**: Attualmente il limite è impostato a 15-20 nodi. Proponiamo di alzarlo a **20-30 nodi principali**. Preferisci questa densità o vogliamo spingerci oltre (es. 25-35)?
> 2. **Crescita delle Relazioni Trasversali**: Proponiamo di imporre che ogni nodo abbia **almeno 2-3 collegamenti** (sia verso i Super-Hub che trasversali verso altri nodi di Livello 2). Questo renderà il KG estremamente reticolare. Pensi che questo livello di densità sia ottimale per lo studio?
> 3. **Lunghezza delle Spiegazioni**: Proponiamo di aumentare la lunghezza massima del campo `desc` a **50-60 parole** (invece di 30-40) per dare definizioni storiche/scientifiche più profonde. È in linea con le tue aspettative?

---

## Proposed Changes

### [public/js/app.js](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/public/js/app.js)

#### [MODIFY] [app.js](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/public/js/app.js#L2085-L2090)
Abiliteremo esplicitamente `maxOutputTokens: 8192` all'interno della `generationConfig` di `extractKnowledgeGraphSinglePass`. Questo sbloccherà automaticamente il limite del bridge di Infomaniak da 4000 a 8192 token:

```javascript
    const payload = {
        contents: [{ parts: [...fileParts, { text: promptText }] }],
        systemInstruction: { parts: [{ text: KNOWLEDGE_GRAPH_SYSTEM_INSTRUCTION }] },
        generationConfig: { 
            temperature: 0.2, 
            responseMimeType: "application/json", 
            responseSchema: schema,
            maxOutputTokens: 8192 // <-- SBLOCCO CONTEXT WINDOW IN USCITA
        }
    };
```

---

### [prompts_config.json](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/prompts_config.json)

#### [MODIFY] [prompts_config.json](file:///Users/giacomomeschini/Antigravity/Mapp_AI_Infomaniak/prompts_config.json#L12-L13)
Aggiorneremo i prompt dei Knowledge Graph (`KNOWLEDGE_GRAPH_SINGLE_IT` e `KNOWLEDGE_GRAPH_SINGLE_EN`) con i seguenti rinforzi:
*   Aumento del limite di nodi a **20-30 nodi** (o secondo feedback).
*   Richiesta esplicita di densità reticolare (minimo **2-3 archi per nodo**, incentivando collegamenti trasversali tra nodi di Livello 2).
*   Aumento del limite delle descrizioni a **50-60 parole**.
*   Richiesta di estrazione di **almeno 2 citazioni testuali reali (chunks)** per ogni nodo per raddoppiare le fonti verificate.

---

## Verification Plan

### Automated & Manual Tests
1. **Verifica della generazione dei KG**: Avviare la generazione di un Knowledge Graph e verificare che la risposta JSON non venga troncata e che utilizzi più di 4000 token.
2. **Controllo delle metriche di utilizzo**: Monitorare nel display dei costi che il consumo di output token superi agevolmente i 4000 token per le fonti estese.
3. **Analisi Strutturale del Grafo**: Verificare sul canvas D3 che la densità delle relazioni trasversali sia aumentata, mantenendo i Super-Hub colorati al centro e i nodi disposti a rete.
