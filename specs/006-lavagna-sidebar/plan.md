# Implementation Plan: Lavagna nella sidebar + sblocca gruppo + sidebar ridimensionabile

**Branch**: `006-lavagna-sidebar` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-lavagna-sidebar/spec.md`

## Summary

Portare la gestione della Lavagna collaborativa dal popup modale a un **renderer
riusabile** montabile nel **tab Struttura della sidebar** e in un **pannello
fluttuante collassabile** (stessi dati live). Aggiungere l'azione **"sblocca"**
per un gruppo consegnato (nuovo endpoint admin `/api/reopen` → `done=false`).
Rendere l'**albero dei rami collassato di default** (popolando il Set
`collapsedTreeNodes` esistente). Rendere la **sidebar ridimensionabile** a mano
(min 320px → max 50% finestra, larghezza persistita, via inline `!important`).
Ogni cambiamento è reversibile con kill-switch localStorage.

## Technical Context

**Language/Version**: JavaScript ES2020 (renderer Vanilla JS, script globali `window.*`, NO moduli ES); Node.js (Electron 30 main + collab-server.js HTTP puro)

**Primary Dependencies**: Electron 30, D3.js v7, qrcode-generator (vendored), Lucide. Nessuna dipendenza nuova.

**Storage**: localStorage (`mappai_sidebar_width`, kill-switch `mappai_collab_legacy_modal`, `mappai_tree_expanded_default`); i contributi Lavagna restano su disco via collab-server.js (invariato)

**Testing**: `npm test` (node --test); nuovo test server per `/api/reopen` in `tests/collab-server.test.js`; debug-run Electron per la UI

**Target Platform**: desktop (Electron); la Lavagna richiede l'app desktop (server LAN via IPC)

**Project Type**: desktop-app (Electron, renderer senza build step)

**Performance Goals**: la mappa resta sempre visibile durante la gestione (SC-001); lista gruppi aggiornata al ritmo del polling esistente (3s)

**Constraints**: reversibilità (kill-switch); overlay `g#collab-overlay` resta separato da `appState.db`; CSS in `@layer components`/inline, non riscrivere style.css; i18n bilingue; suite verde

**Scale/Scope**: ~4-10 gruppi per sessione; alberi mappa fino a centinaia di nodi

## Constitution Check

*GATE: verificato contro Constitution v1.0.0 — PASS (pre-research e post-design).*

| Principio | Esito | Note |
|---|---|---|
| I. Accessibilità BES/DSA | ✅ | Feature lato docente; l'albero collassato riduce il carico visivo; sidebar più larga a scelta; badge ✓ ha già testo/tooltip (non solo colore) |
| II. Reversibilità e gradualità | ✅ | Kill-switch: `mappai_collab_legacy_modal` (torna al popup), `mappai_tree_expanded_default` (albero espanso), larghezza assente = CSS attuale. Endpoint additivo |
| III. Script globali, no build | ✅ | Modifiche in mappai-collab-teacher.js + mappai-ui-modals.js + nuovo mappai-sidebar-resize.js su `window.*`; overlay separato da appState.db |
| IV. Dual-provider AI | ✅ N/A | Nessuna chiamata AI |
| V. Integrità vault (DAL) | ✅ N/A | Il vault non è toccato; la Lavagna usa `~/Documents/MappAI - Lavagna/` (invariato) |
| VI. Logica pura testata | ✅ | `/api/reopen` coperto da test server; il resto è UI/DOM (debug-run). Nessuna nuova logica pura complessa |
| VII. i18n bilingue | ✅ | `data-i18n` nei due dizionari per l'HTML statico; `window.t('cl_*', fallback IT)` per le stringhe JS |

Nessuna violazione → Complexity Tracking vuota.

## Project Structure

### Documentation (this feature)

```text
specs/006-lavagna-sidebar/
├── spec.md
├── plan.md              # questo file
├── research.md          # R1-R6
├── data-model.md        # entità/stati/store
├── quickstart.md        # verifica manuale
├── contracts/
│   └── api-and-ui.md    # /api/reopen + API window.* + kill-switch
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
collab-server.js                         # MODIFICA: endpoint POST /api/reopen (admin → g.done=false)
public/
├── index.html                           # MODIFICA: sezione #collab-sidebar-panel nel tab Struttura;
│                                         #   maniglia #sidebar-resizer; bottone avvio QR in fondo all'albero;
│                                         #   stile resizer/pannello in @layer components
├── js/
│   ├── mappai-collab-teacher.js         # MODIFICA: renderCollabPanel(targetEl) riusabile; host sidebar +
│   │   #   floating; bottone "stacca"; bottone/handler "sblocca" (reopen); openDashboard dietro kill-switch
│   ├── mappai-ui-modals.js              # MODIFICA: collapseAllTree() + hook collasso di default
│   ├── mappai-sidebar-resize.js         # NUOVO: maniglia resize, clamp min/max, persistenza, re-clamp su window.resize
│   └── mappai-d3-render.js              # MODIFICA (hook): chiama collapseAllTree dopo il primo render del grafo
└── traduzioni/
    ├── it_translations.js               # MODIFICA: chiavi data-i18n statiche nuove
    └── en_translations.js               # MODIFICA: chiavi data-i18n + chiavi t()
tests/
└── collab-server.test.js               # MODIFICA: +test /api/reopen (done→false, gate adminToken)
```

**Structure Decision**: si resta nell'architettura del repo — moduli `mappai-*.js`
a script globali, server HTTP puro Node. Un solo file nuovo (resize); il resto
sono modifiche chirurgiche ai moduli collab/sidebar esistenti. Overlay mappa e
storage contributi invariati.

## Design decisions (da research.md)

1. **R1**: `renderCollabPanel(targetEl)` builder+wiring unico; host sidebar
   `#collab-sidebar-panel` + floating `#collab-float-panel`; polling aggiorna
   entrambi; `openDashboard` dietro `mappai_collab_legacy_modal`.
2. **R2**: floating `position:fixed` collassabile, stesso renderer.
3. **R3**: `POST /api/reopen {adminToken,nick}` → `g.done=false` + persist;
   bottone "sblocca" visibile se `g.done`.
4. **R4**: `collapseAllTree()` popola `collapsedTreeNodes` coi non-foglia dopo il
   render; kill-switch `mappai_tree_expanded_default`.
5. **R5**: `#sidebar-resizer` drag → inline `width !important`, clamp
   min 320 / max 50% `innerWidth`, persist `mappai_sidebar_width`, re-clamp su resize.
6. **R6**: i18n regola 13.

## Complexity Tracking

Nessuna violazione — tabella vuota.
