# MappAI — Rules per Claude Code e co-developer

Regole di sviluppo per questa codebase. Catturano la **conoscenza nascosta**
(invarianti, vincoli dei provider AI, pattern obbligati) che non si deduce
leggendo il codice e che, se ignorata, reintroduce bug già risolti.

> **Audience:** Claude Code (agente) e qualsiasi co-developer in onboarding.
> Ogni regola è autosufficiente: cosa, perché, fai / non fare, riferimenti al codice.

## Indice

| # | Regola | Riguarda |
|---|---|---|
| [01](01-ai-client.md) | **AI client: un solo choke point** | Ogni chiamata AI passa da `fetchModelAPI` |
| [02](02-infomaniak-bridge.md) | **Bridge Infomaniak** | Vincoli traduzione Gemini→OpenAI |
| [03](03-json-from-ai.md) | **JSON da AI** | Mai `JSON.parse` diretto, sempre salvage |
| [04](04-state-access.md) | **Accesso allo stato** | `appState.db.nodes`, pattern `_getAppState()` |
| [05](05-token-budget-and-thinking.md) | **Token budget & thinking** | Soglie, `maxItems`, troncamento |
| [06](06-modules-and-extraction.md) | **Moduli & estrazione** | Convenzioni `mappai-*.js`, test a flag |
| [07](07-relations-taxonomy.md) | **Tassonomia relazioni** | `EDGE_FAMILIES`, normalizzazione verbi |
| [08](08-ui-modals-and-icons.md) | **Modali & icone** | `.pm-*`, `safeCreateIcons`, `type="button"` |

## Come Claude Code carica queste regole

Per renderle parte del contesto automatico, aggiungere a `CLAUDE.md` (root) gli import:

```
@docs/rules/01-ai-client.md
@docs/rules/02-infomaniak-bridge.md
... (gli altri)
```

Finché l'import non è presente, vanno lette manualmente prima di lavorare sull'area
corrispondente.

## Stato della migrazione

Questa codebase è in transizione dal monolite `public/js/app.js` (~16.000 righe)
verso moduli puliti e testabili. Vedi [06-modules-and-extraction.md](06-modules-and-extraction.md)
per il pattern di estrazione incrementale (Strangler Fig) e la strategia di test a flag.
