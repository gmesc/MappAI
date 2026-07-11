# Implementation Plan: Lavagna Collaborativa (003-lavagna-collaborativa)

**Branch**: `003-lavagna-collaborativa` (lavoro avviato su `002-affinamenti-output`,
stessa linea) | **Date**: 2026-07-11 | **Spec**: [spec.md](spec.md)

## Summary

Fratello architetturale del Knowledge Garden: server HTTP Node puro nel main
process (IPC start/stop, QR con token, persistenza crash-safe), pagina studente
vanilla self-contained (nodi rettangolari attorno al ROOT, sync automatico a
polling), overlay a layer sul canvas D3 del docente (toggle/rinomina, zero
contaminazione di `appState.db`), export layer come JSON mappa MappAI.

## Technical Context

**Language/Version**: JavaScript ES2020 (renderer) + Node 18 (main process, server)

**Primary Dependencies**: nessuna nuova — riuso `qrcode-generator.js` (vendored),
pattern `garden-server.js`, `lanUrls()` in main.js

**Storage**: `~/Documents/MappAI - Lavagna/<slug>/` — `session.json` +
`groups/<slug>.json` (uno per gruppo) + `board.json` (snapshot unito)

**Testing**: `tests/collab-core.test.js` (logica pura UMD) +
`tests/collab-server.test.js` (server headless su porta effimera, stile
garden-server.test.js). UI studente/docente: verifica manuale.

**Target Platform**: server+docente su desktop Electron; studente su qualunque
browser mobile/desktop della LAN

**Constraints**: offline/LAN-first (nessun cloud); niente WebSocket (polling);
token su ogni API; allowlist statica; body cap 1 MB; porta 8766–8776

**Scale/Scope**: ~8 gruppi × 30 nodi; 2 file nuovi runtime + 1 pagina + 2 test file

## Constitution Check

| Principio | Esito | Nota |
|---|---|---|
| I. Accessibilità | ✅ | Pagina studente minimale, touch-first, contrasti palette; carico cognitivo basso (un solo gesto: crea/trascina) |
| II. Reversibilità | ✅ | Overlay separato da appState (si spegne senza tracce); server on/off; dati su disco riapribili |
| III. Script globali | ✅ | Moduli window.*, core UMD, pagina studente self-contained |
| IV. Dual-provider | ✅ N/A | Nessuna chiamata AI |
| V. Vault | ✅ | Export = JSON mappa standard (import esistente); nessuna scrittura vault diretta in v1 |
| VI. Logica pura testata | ✅ | `mappai-collab-core.js` UMD + test; server testato headless |
| VII. i18n | ✅ | Stringhe docente via `window.t`; pagina studente bilingue semplice (IT default) |

## Project Structure

```text
collab-server.js                      # NUOVO — server LAN (pattern garden-server)
public/
├── collab/student.html               # NUOVO — pagina studente self-contained
├── js/
│   ├── mappai-collab-core.js         # NUOVO — logica pura UMD (validate/merge/layerToGraph)
│   └── mappai-collab-teacher.js      # NUOVO — modale docente: avvio, QR, dashboard, overlay layer, export
├── index.html                        # script tags (qrcode vendor, core, teacher) + voce menu
main.js                               # IPC collab-start/stop-session, collab-session-status
public/js/preload.js                  # expose IPC
tests/collab-core.test.js             # NUOVO
tests/collab-server.test.js           # NUOVO
```

## Decisioni

- **D1 Server**: file separato `collab-server.js` (NON estendere garden-server:
  flussi E2E-testati da non rischiare). Stessi pattern: token/adminToken,
  ripresa da disco, allowlist (`/public/collab/`, `/public/js/mappai-collab-core.js`,
  `/public/js/vendor/`), redirect `/` → pagina studente col token.
- **D2 API**: `GET /api/session?s=` (meta), `POST /api/join` (nick+deviceId,
  409 se nick di altro device), `POST /api/nodes` (merge last-write-wins,
  validazione per nodo, 422 su nodi tutti invalidi), `GET /api/board?s=`
  (tutti i gruppi — serve a studenti "Mostra classe" E docente),
  `GET /api/status?admin=`, `POST /api/release` (admin).
- **D3 Nodi**: coordinate RELATIVE al centro (x,y ∈ [-1.5,1.5]) → ogni schermo
  li scala ai suoi pixel; palette fissa 8 colori; taglie S/M/L fisse.
- **D4 Overlay**: `g#collab-overlay` appeso al g della mappa, nodi disposti a
  raggiera attorno al nodo root (posizione live dal D3); MAI dentro
  `appState.db`. Toggle/rinomina per gruppo nel modale docente.
- **D5 Export**: `layerToGraph(rootLabel, nick, nodes)` → JSON mappa MappAI
  (root L0 + nodi L1, rel "propone") scaricato come
  `vault-dinamico-<gruppo>.json`; import/merge con le funzioni esistenti.
- **D6 Polling**: studente board 5 s; docente status 3 s (come garden).
  Il renderer docente interroga `http://127.0.0.1:<port>` direttamente
  (stessa macchina) con adminToken; IPC solo per start/stop/info.

## Complexity Tracking

Nessuna violazione. (UI docente e pagina studente non unit-testate: sono DOM,
coperte dalla verifica manuale — la logica che decide è tutta nel core UMD.)
