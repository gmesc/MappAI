# Research — Lavagna nella sidebar + sblocca + resize (006)

Incognite risolte con esplorazione del codice (12/7/26). Nessun NEEDS CLARIFICATION residuo.

## R1 — Dashboard: da popup a renderer riusabile (sidebar + floating)

**Decisione**: estrarre da `openDashboard()` (mappai-collab-teacher.js) un builder
puro dei contenuti + un wiring degli eventi, richiamabile su un contenitore
target qualsiasi: `renderCollabPanel(targetEl)`. Due host:
- **Sidebar**: una sezione `#collab-sidebar-panel` dentro `#sidebar-panel-structure`
  (tab Struttura), popolata quando la sessione è attiva.
- **Floating**: un elemento fisso `#collab-float-panel` (collassabile) creato on
  demand dal bottone "stacca". Stesso `renderCollabPanel`.
`renderGroupsList()` e `startPolling()` aggiornano ENTRAMBI gli host presenti
(iterano sui contenitori montati). `openDashboard` (modale) resta dietro
kill-switch `mappai_collab_legacy_modal='1'` per reversibilità.

**Rationale**: un solo builder = una sola fonte di verità per QR/gruppi/bottoni;
la sidebar e il floating condividono i dati live senza duplicare la logica.

**Alternative**: due implementazioni separate (duplica il wiring, diverge);
iframe/portale (inutile in vanilla). Scartate.

## R2 — Pannello fluttuante collassabile

**Decisione**: `#collab-float-panel` = `position:fixed`, angolo basso-destra,
header con titolo + bottoni "collassa" (mostra solo header) e "chiudi" (torna
solo-sidebar). Contenuto = `renderCollabPanel`. Trascinabile per riposizionarlo
(nice-to-have, non requisito). Stato collasso in memoria (non persistito v1).

**Rationale**: `position:fixed` non tocca il layout della mappa; il docente lo
sposta dove non copre. Per la LIM lo espande.

## R3 — "Sblocca" gruppo → endpoint /api/reopen

**Decisione**: nuovo endpoint admin in `collab-server.js`:
`POST /api/reopen { adminToken, nick }` → se il gruppo esiste, `g.done = false`,
`persistGroup(slug)` + `persist()`, ritorna `{ok:true, done:false}`. Speculare a
`/api/release` (stesso gate adminToken). Lato docente: bottone "sblocca" sul
gruppo (visibile solo se `g.done`) → `fetch(.../api/reopen, {adminToken, nick})`
→ al tick di polling successivo `g.done=false` e il badge ✓ sparisce.
Helper puro opzionale in `mappai-collab-core.js` non necessario (il server muta
un flag booleano); aggiungo comunque un test server per l'endpoint.

**Rationale**: minimal, riusa il pattern release. Lo studente NON viene toccato
(nessun lock): setDone locale resta true sul suo device, ma il docente vede
"in corso" e il gruppo continua a inviare nodi (il server accetta /api/nodes a
prescindere da done — verificato). Coerente con la scelta utente.

**Nota**: lo stato `done` dello studente e quello del server possono divergere
(lo studente non fa polling del proprio done). Accettato: "sblocca" è uno
strumento del DOCENTE per pulire il colpo d'occhio, non un comando allo studente.

## R4 — Albero collassato di default

**Decisione**: l'albero (mappai-ui-modals.js `renderTreeView`) usa
`window.collapsedTreeNodes` (Set): vuoto = tutto espanso (default attuale).
Per collassare di default: al caricamento/generazione di una mappa, popolare il
Set con gli id di TUTTI i nodi che hanno figli (non-foglia). Nuova funzione
`window.collapseAllTree()` chiamata dopo il render iniziale del grafo (hook in
`renderGraph`/load). Kill-switch `mappai_tree_expanded_default='1'` ripristina il
comportamento espanso.

**Rationale**: riusa il meccanismo esistente (collapsedTreeNodes), zero cambi al
renderer dell'albero; l'espansione manuale continua a funzionare.

**Alternative**: flag per-nodo `expanded` (ridondante col Set esistente). Scartata.

## R5 — Sidebar ridimensionabile

**Decisione**: maniglia `#sidebar-resizer` (barra verticale ~6px sul bordo destro
di `#sidebar`). Drag (pointer events) → imposta
`sidebar.style.setProperty('width', px+'px', 'important')` (l'inline `!important`
batte i `!important` di `.app-sidebar` in style.css). Clamp: min = 320px (min
attuale a ≥1024), max = `0.5 * window.innerWidth`. Larghezza persistita in
`localStorage 'mappai_sidebar_width'`, riapplicata al load. Su `window.resize`,
re-clamp al 50% della nuova finestra. Kill-switch implicito: senza valore salvato
resta il comportamento CSS attuale.

**Rationale**: l'inline `!important` è l'unico modo di superare i `!important` del
CSS senza toccare style.css (Costituzione: CSS in `@layer components`/inline,
non riscrivere style.css). Pointer events = drag robusto.

**Alternative**: rimuovere i `!important` da style.css (rischioso, tocca zona
CSS nota fragile). Scartata.

## R6 — i18n

**Decisione**: stringhe statiche eventuali (bottone avvio nel tab) con `data-i18n`
in entrambi i dizionari; stringhe JS (bottone sblocca, titoli pannello, tooltip)
via `window.t('cl_*', 'fallback IT')` con chiave solo in en_translations.js.
Regola 13.
