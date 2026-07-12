# Data Model — Lavagna nella sidebar + sblocca + resize (006)

Nessun nuovo store persistente pesante: la feature è UI + un flag di stato
gruppo già esistente (`done`) + preferenze locali. Tutte le aggiunte additive.

## 1. Gruppo collab (ESISTENTE) — flag `done`

Modello server (`collab-server.js`, oggetto `groups[slug]`):

```js
{
  nick, color, deviceId,
  nodes: [...], links: [...],
  done: false,        // ← "Fatto ✓". NUOVO: /api/reopen lo riporta a false
  rev, updatedAt
}
```

**Transizioni di `done`**:
- studente `/api/nodes {done:true}` → `done = true` (esistente)
- **docente `/api/reopen {nick}` → `done = false`** (NUOVO)
- studente ripreme Fatto → `done = true` (di nuovo)

`/api/status` (admin) e `/api/board` già espongono `done` per gruppo → la UI lo
legge al polling.

## 2. Layer docente (ESISTENTE, in memoria) — `CT.layers[slug]`

Stato UI per-gruppo lato docente (mappai-collab-teacher.js), non persistito:

```js
CT.layers[slug] = { visible: true, label: '<nick>' }
CT.focusSlug = null | '<slug>'   // "SOLO"
```

Invariato. La sidebar/floating leggono e mutano questi stessi campi.

## 3. Stato albero (ESISTENTE) — `window.collapsedTreeNodes`

`Set<nodeId>` dei nodi collassati (mappai-ui-modals.js). Oggi parte VUOTO
(tutto espanso).

**Cambio**: `collapseAllTree()` popola il Set con gli id di tutti i nodi
**non-foglia** dopo il primo render del grafo. Kill-switch
`mappai_tree_expanded_default='1'` → salta il popolamento (comportamento attuale).
`toggleTreeCollapse` (esistente) continua a espandere/collassare per nodo.

## 4. Preferenza larghezza sidebar (NUOVO)

```js
localStorage['mappai_sidebar_width'] = '<px>'   // es. "520"
```

Applicata al load come `#sidebar.style.setProperty('width', px+'px', 'important')`.
Clamp: `min = 320`, `max = Math.floor(0.5 * window.innerWidth)`. Assente = nessun
override → vale il CSS attuale di `.app-sidebar`.

## 5. Kill-switch (NUOVI, localStorage)

```js
localStorage['mappai_collab_legacy_modal']  = '1' → dashboard = popup storico (openDashboard)
localStorage['mappai_tree_expanded_default'] = '1' → albero espanso di default (comportamento attuale)
```

## 6. Host dashboard (NUOVI, elementi DOM)

- `#collab-sidebar-panel` — contenitore dentro `#sidebar-panel-structure`
  (tab Struttura). Popolato da `renderCollabPanel` quando la sessione è attiva.
- `#collab-float-panel` — elemento `position:fixed` creato on demand dal bottone
  "stacca"; collassabile; stesso `renderCollabPanel`. Stato collasso in memoria.

## Relazioni

```
collab-server groups[slug].done ──(/api/status polling)──> renderGroupsList ──> badge ✓ / bottone "sblocca"
   ▲                                                              │
   └──────── POST /api/reopen {nick} ◀── click "sblocca" ────────┘

renderCollabPanel(targetEl) ──> #collab-sidebar-panel  (tab Struttura)
                            └──> #collab-float-panel    (fluttuante, se staccato)
   entrambi aggiornati da startPolling → renderGroupsList (itera gli host montati)

collapsedTreeNodes (Set) ──> renderTreeView ──> albero collassato di default
mappai_sidebar_width ──> #sidebar width !important (clamp 320..50%)
```

## Invarianti

1. L'overlay dei contributi (`g#collab-overlay`) resta separato da `appState.db`
   (nessuna contaminazione dei dati mappa del docente).
2. `renderGroupsList` aggiorna TUTTI gli host dashboard presenti (sidebar +
   floating) allo stesso tick — nessuna divergenza tra le due viste.
3. Larghezza sidebar sempre nei limiti `[320, 0.5*innerWidth]`, anche dopo resize
   della finestra.
4. Senza sessione attiva, il tab Struttura mostra l'albero + il bottone "avvia
   condivisione"; la sezione gruppi appare solo a sessione avviata.
