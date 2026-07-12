# Contracts — Lavagna nella sidebar + sblocca + resize (006)

## 1. Server — `POST /api/reopen` (NUOVO, admin)

File: `collab-server.js`. Speculare a `/api/release`.

**Request**: `{ adminToken: string, nick: string }`
**Auth**: `adminToken === session.adminToken` (403 `{error:'token'}` altrimenti)
**Effetto**: se `groups[slug]` esiste (slug = slugify(nick)), `g.done = false`,
`persistGroup(slug)` + `persist()`.
**Response 200**: `{ ok:true, done:false }` (idempotente: gruppo già in-corso →
`{ok:true, done:false}` comunque). Gruppo inesistente → `{ok:true}` no-op oppure
404 (scelta impl.: no-op come release).

**Garanzia**: non tocca `nodes`/`links`/`deviceId`; lo studente continua a
inviare contributi.

## 2. Renderer dashboard — `window.MappAICollab` (mappai-collab-teacher.js)

Refactor: estrarre il builder+wiring in una funzione riusabile.

```js
// Monta la dashboard (QR, URL, gruppi, bottoni) dentro targetEl.
renderCollabPanel(targetEl)          // usato per sidebar e floating

// Host management
mountSidebarPanel()                  // popola #collab-sidebar-panel (tab Struttura)
openFloatingPanel()                  // crea/mostra #collab-float-panel (stacca)
toggleFloatingCollapse()             // collassa/espande il floating

// Azioni gruppo (oltre alle esistenti toggle/focus/rename/export):
reopenGroup(slug)                    // → fetch POST /api/reopen {adminToken, nick}

// startPolling/renderGroupsList: aggiornano OGNI host montato (sidebar+floating)
```

`renderGroupsList()` per ogni gruppo con `g.done` mostra il bottone **"sblocca"**
(oltre a ON/OFF, SOLO, JSON, rename, badge ✓). Click → `reopenGroup(slug)`.

`openDashboard()` (modale storico) resta, invocato solo se
`localStorage.mappai_collab_legacy_modal === '1'`.

## 3. Albero — `window.collapseAllTree` (mappai-ui-modals.js)

```js
collapseAllTree()   // popola window.collapsedTreeNodes con gli id non-foglia,
                    // poi renderTreeView(). No-op se mappai_tree_expanded_default==='1'.
```

Chiamata dopo il primo render del grafo (hook in mappai-d3-render.js) e
all'apertura del tab Struttura se il Set è vuoto per una mappa appena caricata.

## 4. Resize sidebar — `window.MappAISidebarResize` (mappai-sidebar-resize.js, NUOVO)

```js
init()              // aggancia la maniglia #sidebar-resizer, riapplica larghezza salvata
applyWidth(px)      // clamp [320, 0.5*innerWidth] → #sidebar width !important + persist
// listener interni: pointerdown/move/up sulla maniglia; window.resize → re-clamp
```

Larghezza in `localStorage 'mappai_sidebar_width'`. Assente = CSS attuale.

## 5. Avvio sessione dal tab Struttura

Bottone in fondo a `#tree-view-container` → `window.openCollabHub()` (già
esistente) OPPURE, con la nuova UI, `mountSidebarPanel()` + avvio server. Il
flusso di avvio server (IPC `collabStartSession`) resta invariato; cambia solo
DOVE si mostra la dashboard risultante.

## 6. IPC / preload

Nessun nuovo IPC: `/api/reopen` è una `fetch` diretta a `127.0.0.1:<port>` con
`adminToken` (stesso pattern di `/api/release` e del polling `/api/status`).

## 7. i18n (chiavi riservate)

- `data-i18n` statici (se presenti nell'HTML): `ui_collab_start_qr` (bottone avvio
  nel tab) — in ENTRAMBI i dizionari.
- Stringhe JS: `cl_reopen` ("sblocca"), `cl_reopen_tip`, `cl_detach`
  ("stacca pannello"), `cl_dock` ("riaggancia"), `cl_collapse`, titoli pannello —
  via `window.t('cl_*', 'fallback IT')`, chiave solo in en_translations.js.
