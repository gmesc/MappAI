# 🗺️ Guida MappAI — Come lavorare al meglio
> Aggiornato: 1 giugno 2026

---

## 1. Aprire una sessione

```
@CLAUDE.md @TODO.md Riprendiamo MappAI.
Priorità oggi: [cosa vuoi fare]
```

Questo è **tutto quello che serve**. Claude legge il contesto in 30 secondi e parte operativo.

---

## 2. I tuoi comandi slash

| Comando | Quando usarlo |
|---|---|
| `/save-work` | Vuoi salvare il lavoro adesso, con un messaggio descrittivo |
| `/merge-to-main` | Una feature è stabile e pronta — merge su `MappAI_main` |
| `/graphify` | Vuoi fare una domanda sul codice ("dove è definita X?", "cosa chiama Y?") |
| `/consolidate-memory` | Fine sessione lunga — aggiorna la memoria personale |

Il **Stop hook** si attiva da solo quando chiudi Claude Code — non devi fare nulla.

---

## 3. Regole d'oro del codice (MAI ignorarle)

```javascript
// GIUSTO
appState.db.nodes

// SBAGLIATO — non esiste
appState.nodes
```

```javascript
// GIUSTO — sempre
const parsed = salvageTruncatedJSON(responseText);

// MAI direttamente
const parsed = JSON.parse(responseText);
```

```html
<!-- Bottoni dentro form — sempre type="button" -->
<button type="button">...</button>
```

```javascript
// CSS — modifica nel blocco @layer components in index.html
// Non toccare style.css (703 !important)
```

---

## 4. I due provider AI — differenze critiche

| | Google Gemini | Infomaniak |
|---|---|---|
| Context | 1M–2M token | 65K–256K (dipende dal modello) |
| `responseMimeType` | supportato | NON usare |
| Streaming | opzionale | obbligatorio (SSE) |
| `temperature` | rispetta il payload | hardcoded a 0.3 nel bridge |
| Usato per | tutto | GDPR svizzero, dati scolastici |

**Regola pratica:** ogni fix va testato su entrambi. Un fix che funziona solo su Google non è accettabile.

---

## 5. Dove si trovano le cose in `app.js`

| Cosa cerchi | Dove cercarla |
|---|---|
| Estrazione KG | `extractKnowledgeGraphSinglePass` / `extractKnowledgeGraphMultiPass` |
| Estrazione MM | `extractMindMapIterative` (single-pass) / multipass HD |
| Rendering D3 | `renderGraph()`, `getNodeRadius()`, `drag()`, `applyPinning()` |
| Cleanup label | `cleanLabel()` |
| Chiamata AI | `window.fetchModelAPI(payload, apiKey)` |
| Stato globale | `appState` — vedi sezione 3 per le trappole |

```bash
# Trovare rapidamente una funzione
grep -n "function extractKnowledgeGraph" public/js/app.js
```

---

## 6. I prompt template — come funzionano

I template sono in `prompts_config.json` (attivo) e `prompts_default.json` (default di fabbrica).

```javascript
const prompt = window.fillPromptTemplate('NOME_TEMPLATE_IT', {
    rootNodeLabel: appState.rootNodeLabel,
    textParts: textParts.join('\n\n'),
    focusTopic: appState.focusTopic
        ? '\n\nISTRUZIONI AGGIUNTIVE:\n' +
          appState.focusTopic.replace(/[`"{}[\]\\]/g, ' ').trim() + '\n'
        : ''
});
```

**Regola:** `{{focusTopic}}` va **prima** dello schema JSON nel template, mai dopo.

**Attenzione:** se l'utente fa "Ripristina Default" nell'Admin panel, il `prompts_config.json`
in `userData` viene resettato e i fix manuali vengono persi. La copia del repo è la fonte di verità.

---

## 7. Le Extraction Lenses — come funzionano

```javascript
// Flusso completo
window.updateFocusFromLenses()  // aggiorna appState.focusTopic
// ↓
appState.focusTopic             // viene iniettato nei template
// ↓
fillPromptTemplate(...)         // {{focusTopic}} nel template
```

**Lens "date":** incorpora la data nel label del nodo evento, es. `"1968 Primavera di Praga"`.
NON crea nodi separati per le date.

**Lens "cronologia":** eliminata (era ridondante).

---

## 8. La fisica D3 — le regole per non romperla

```javascript
// Tenere la simulazione viva durante il pin
simulation.alpha(0.05)   // tick visivi attivi

// Non usare — uccide il tick engine
simulation.alpha(0)
simulation.alphaTarget(0)  // in toggleAttraction
```

Layout iniziale:
- **MM**: pre-posizionamento gerarchico radiale → poi simulazione D3
- **KG**: hub in cerchio + cluster force persistente (α × 0.12) → poi simulazione D3

---

## 9. Git — il flusso sicuro

```
dev          ← qui lavori ogni giorno
    ↓ (quando pronto)
MappAI_main  ← versione stabile
```

- **Non committare mai direttamente su `MappAI_main`** — usa sempre `/merge-to-main`
- Il Stop hook salva tutto automaticamente su `dev` quando chiudi Claude Code
- `/save-work` per commit manuali con messaggio descrittivo durante la sessione

---

## 10. Bug noti da tenere a mente

| Sintomo | Causa | Workaround |
|---|---|---|
| KG scarso con Infomaniak | Context overflow o `responseMimeType` presente | Verificare che `responseMimeType` sia assente |
| `Unexpected end of JSON input` con Gemini Pro | `maxOutputTokens` troppo basso | Aumentare a 16384 |
| Admin panel bottone verde non risponde | Nessun prompt selezionato | Selezionare prima un prompt dalla lista |
| Label L1 con liste tra parentesi | AI interpreta lenses sui label | `cleanLabel()` rimuove automaticamente |

---

## 11. Fine sessione — checklist

1. Hai testato su entrambi i provider?
2. Vuoi un commit descrittivo? → `/save-work`
3. La feature è stabile? → `/merge-to-main`
4. Sessione lunga con decisioni importanti? → `/consolidate-memory`
5. Architettura cambiata? → aggiorna `CLAUDE.md`
