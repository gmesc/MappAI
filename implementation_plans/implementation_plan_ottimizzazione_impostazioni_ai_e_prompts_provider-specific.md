# Ottimizzazione Impostazioni AI e Prompts Provider-Specific

Questo piano affronta le problematiche di UI nel selettore dei modelli AI e l'architettura dei prompt per gestire in modo ottimale le differenze di calcolo tra i modelli Google (Gemini) e i modelli open-weight forniti da Infomaniak (Llama, Mixtral, Gemma).

## Open Questions
- Vuoi che eliminiamo alcuni modelli più "piccoli" e inaffidabili dalla lista di Infomaniak (se ce ne sono) per lasciare solo quelli ad alte prestazioni (es. Mixtral 8x22B o Llama 3 70B)?
- Per Gemini, vuoi che manteniamo l'attuale divisione tra "Gemini Flash" e "Gemini Pro", o vuoi aggiungere nuovi parametri (es. temperatura) nella UI?

## Risposta ai tuoi dubbi su Infomaniak e i vari modelli
Attualmente, la richiesta che MappAI invia a Infomaniak viene intercettata dal file `infomaniak_bridge.js`. Questo file applica già delle "cure" standardizzate (come forzare l'esempio JSON nel prompt) e, grazie al recente aggiornamento, sanitizza gli ID in Javascript. 
Tuttavia, modelli diversi (es. Mistral vs Llama) hanno capacità cognitive diverse. Per evitare che i modelli meno potenti vadano in confusione, la soluzione migliore è **semplificare le istruzioni testuali** e ridurre la richiesta di nodi (es. chiedere 5-8 nodi invece di 15) quando si usa Infomaniak, mantenendo invece i prompt complessi per Gemini.

## Proposed Changes

### 1. Interfaccia UI (Impostazioni AI)
- **Selezione Evidente:** Modificherò i bottoni dei modelli (sia nel tab Gemini che Infomaniak) affinché il modello attualmente selezionato appaia visivamente "attivo" (es. con un bordo colorato, un'icona di spunta ✅ e testo in grassetto), disattivando visivamente gli altri.
- **Testi Descrittivi:**
  - **Tab Google Studio:** Aggiungerò testi chiari che spiegano i punti di forza (contesto infinito, ragionamento profondo, perfetta aderenza agli schemi JSON complessi) e l'adattabilità per testi universitari.
  - **Tab Infomaniak:** Spiegherò che usa modelli open-source (Llama, Mistral) eccellenti per la privacy e testi medi, ma con un limite di "attenzione" strutturale.

### 2. Architettura dei Prompt (`prompts_config.json` & `app.js`)
Creeremo due binari separati per le istruzioni:
- **Binario Gemini:** Utilizzerà i prompt attuali, liberi di richiedere analisi complesse, fino a 15-20 nodi e gerarchie profonde.
- **Binario Infomaniak:** Aggiungeremo nuove chiavi nel JSON (es. `MIND_MAP_BRANCH_INFOMANIAK_IT`). Questi prompt avranno istruzioni più dirette, frasi più corte e chiederanno un numero ridotto di ramificazioni per evitare che il modello vada in "out of token" o "allucinazione".

#### [MODIFY] app.js
Aggiornerò la logica che preleva le stringhe da `prompts_config.json` per controllare quale provider è attivo. Se `appState.aiProvider === 'infomaniak'`, il sistema cercherà prima la variante `_INFOMANIAK_IT`. Se non esiste, userà quella standard.
Aggiungerò anche la logica per aggiornare graficamente i bottoni di selezione del modello in base allo stato attuale di `appState.aiModel`.

#### [MODIFY] prompts_config.json
Aggiungerò le varianti semplificate per Infomaniak per i task più critici (es. `MIND_MAP_BRANCH_INFOMANIAK_IT` e `KNOWLEDGE_GRAPH_SINGLE_INFOMANIAK_IT`).

## Verification Plan
1. Aprire la scheda "Impostazioni AI".
2. Verificare che il modello selezionato sia chiaramente evidenziato in entrambi i tab.
3. Testare il cambio di tab e verificare i nuovi testi informativi per Google Studio.
4. Generare una mappa con Infomaniak e verificare tramite i log di rete che il prompt inviato sia la versione semplificata `_INFOMANIAK_IT`.
