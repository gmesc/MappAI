# Knowledge Garden — contratto dati, API e guida docente

> Pivot del 10 luglio 2026: il Memory Dungeon (dungeon, gatekeeper, sapienti, mob)
> è stato accantonato. L'editor voxel vive una seconda vita come **Knowledge
> Garden**: un giardino 3D percorribile che diventa lo spazio espositivo della
> classe. Ogni studente rivendica una **parcella**, la costruisce (texture,
> muri fino ad altezza 10, oggetti 3D) e la consegna con una **targhetta
> obbligatoria** che dichiara quale concetto della mappa mentale rappresenta.

## 1. Architettura

```
PC docente (Electron)                       Dispositivo studente (browser qualsiasi)
┌────────────────────────────┐              ┌────────────────────────────┐
│ Studio → card 🌱           │   QR (URL+   │ garden.html + garden.js    │
│  IPC garden-*              │    token)    │  passeggiata + creator mode│
│ main.js ── garden-server.js│ ───────────► │                            │
│  Node http :8765 (LAN)     │ ◄─────────── │ GET  /api/session          │
│  static allowlist + REST   │  claim/plot  │ POST /api/claim /api/plot  │
└────────────────────────────┘              └────────────────────────────┘
Archivio: ~/Documents/MappAI - Knowledge Garden/<slug-sessione>/
          session.json · template.json · plots/pNN.json · merged.json
```

- Il **server LAN** parte dallo Studio (finestra Electron docente), porta 8765
  (fallback 8766-8775), bind su tutte le interfacce.
- Gli **studenti** aprono il QR nel browser: nessuna installazione, funziona
  anche su iPad. Il token di sessione è nell'URL.
- Ogni mutazione è **persistita su disco**: se il PC docente si riavvia, la
  sessione riprende con lo stesso token (i QR stampati restano validi).

## 2. Parcelle — maschere di celle

Una parcella è una **maschera di celle** (anche non rettangolare):

```json
{ "id": "p01", "cells": [[3,4],[4,4],[3,5], ...] }
```

- Il docente le **disegna nell'editor** col pennello **🌱 Parcella** (forma
  rotonda/quadrata, raggio 1-8, solo su celle pavimento). L'editor le esporta
  nel map JSON come campo top-level `plots:[...]` e come campo `plot` sulle
  celle. Sovrapposizioni impossibili per costruzione (una cella ha una sola
  parcella); avvisi live per area < 25 celle.
- Template **senza** parcelle → griglia automatica di fallback (lato dal campo
  «Parcella» dello Studio, default 15, margine 2, vialetti 3).
- `proto.js` ignora `plots` → i template restano mappe normali retro-compatibili.

## 3. File di sessione (sul PC docente)

| File | Contenuto |
|---|---|
| `session.json` | meta sessione, token, adminToken, claims correnti |
| `template.json` | template del giardino (con `plots` e `_libs`) |
| `plots/pNN.json` | una consegna per parcella: `{plotId, concept, cells, props, owner, at}` |
| `merged.json` | giardino UNITO — map JSON standard, si riapre per sempre con `garden.html?map=` o `index.html?map=` |

## 4. API del server (garden-server.js)

Tutte le chiamate studente richiedono il token di sessione (`?s=` o `body.token`).
Operazioni docente: `adminToken` (mai nel QR).

| Endpoint | Metodo | Descrizione |
|---|---|---|
| `/` | GET | redirect a `garden.html?s=<token>` |
| `/api/session` | GET | `{session, template(unito), libs, plots(con stato)}` |
| `/api/claim` | POST | `{token, plotId, deviceId, owner:{name}}` → 200 · 409 se presa (first-come; stesso device può ri-rivendicare; cambio parcella libera la vecchia) |
| `/api/plot` | POST | consegna `{token, plotId, deviceId, concept, cells, props}` → validata con `validateSubmission` (bounds maschera, muri 1..10, quota ±2, ≤60 oggetti, ≤400 KB, **targhetta obbligatoria**) → 200 · 422 con errori · 403 device sbagliato. Riconsegna = sovrascrittura (iterazione permessa) |
| `/api/status` | GET | dashboard docente (adminToken) |
| `/api/release` | POST | il docente libera un claim orfano (adminToken); la consegna resta esposta |

**Static allowlist**: solo `/tools/voxel-proto/`, `/public/js/vendor/`,
`/public/assets/`, `/public/js/mappai-garden-core.js`. Tutto il resto (main.js,
vault, chiavi) → 403. Path traversal rifiutato. Body cap 1 MB.

**Librerie**: texture/materiali/asset del docente vivono nel suo localStorage →
viaggiano nel bundle di sessione (`libs`), perché il browser dello studente
parte vuoto.

## 5. Targhetta (obbligatoria)

```json
{ "title": "2..60 caratteri", "text": "10..400", "author": "2..40" }
```

Senza targhetta la consegna è rifiutata (client E server, stessa funzione pura
`validateTarghetta`). Nel giardino diventa un cartello 🪧 cliccabile al centro
della parcella.

## 6. Muri cutaway «una faccia»

Un muro adiacente al pavimento di una parcella diventa **trasparente quando la
camera lo guarda da dietro** (stile dollhouse): l'interno espositivo si vede
sempre. Regola pura `wallVisibility` in `mappai-garden-core.js` (testata sui 4
quadranti), ricalcolata allo snap 90° di Q/E. Le collisioni non cambiano.

## 7. Guida docente — flusso tipico

1. **Prepara il template** nell'editor (Studio → «Apri editor libero», o
   parti da un template pronto): pavimento/acqua/muri/rilievo/materiali, poi
   pennello **🌱 Parcella** per disegnare le aree degli studenti (una per
   studente, area ≥ 25 celle). «Salva (usata dal gioco)».
2. Studio → card **🌱 Knowledge Garden** → nome sessione → «Avvia sessione».
3. **QR a schermo intero** sul proiettore. Gli studenti (stessa rete Wi-Fi)
   inquadrano ed entrano dal browser.
4. Dashboard: parcelle 🟢 libere / 🟡 al lavoro / 🪧 consegnate, coi titoli.
5. «Chiudi sessione» quando vuoi: l'archivio resta. Riavviando una sessione con
   lo **stesso nome** tutto riprende (stesso QR).
6. `merged.json` nella cartella archivio = la mostra permanente della classe.

### Come costruisce lo studente (device-adaptive, 11/7/26)

- **Da PC/portatile**: dopo il claim, l'HUD offre **«🛠 Editor completo»** — è
  l'editor vero (editor.html) servito dal server in *modalità studente*
  (`editor.html?s=<token>&plot=<pNN>`): stessa UI e stesse funzionalità
  (terreno, muri fino a 10, rilievo, costruttore voxel, pixel art→texture,
  materiali), «Consegna» al posto del vault.
  **L'editor mostra SOLO IL CROP della parcella**: bounding box della maschera
  → mini-mappa locale (fuori maschera = vuoto), camera addosso, palette verde
  del giardino. Le coordinate tornano globali in bozza/consegna (offset
  trasparente). La **bozza è condivisa** col giardino (stessa chiave): si passa
  da passeggiata a editor e ritorno senza perdere nulla.
- **Da telefono/tablet**: la pittura del terreno è scomoda → il pannello
  costruzione mostra solo **«🧊 Crea asset voxel»** e **«🎨 Crea asset 2D»**
  (saltano alle schede Voxel/Pixel dell'editor) più il piazzamento oggetti,
  il ripristino e la consegna. Override di test dal PC: `&mobile=1`.
- **Texture/materiali creati dallo studente**: alla consegna vengono
  rinominati `pNN.<nome>` (namespacing automatico, `namespacePlotLibs`) e
  il server li unisce alle librerie di sessione → gli altri device li
  renderizzano. Cap: 24 texture + 24 materiali per parcella, 64 KB l'una;
  i tag vengono azzerati (i pool `#tag` del docente restano canonici).

### Se il QR non funziona
- **Firewall**: al primo avvio macOS/Windows chiede di consentire connessioni
  in entrata a MappAI → consenti.
- **AP isolation**: alcune reti scolastiche isolano i dispositivi tra loro →
  usa l'hotspot del telefono del docente (tutti si collegano lì).
- Bottone «👁 Apri il giardino» per verificare dal PC docente (localhost).

## 8. Test in dev (senza Electron)

```bash
python3 -m http.server 8137          # dalla root del repo
# giardino con parcelle finte e stati demo:
open http://localhost:8137/tools/voxel-proto/garden.html?map=maps/giardino_voxel.json&dev=1&plot=5
```

`&dev=1` fabbrica una parcella rivendicata e una consegnata (colori bordo +
cartello); il claim/consegna restano locali. Suite test:
`node --test tests/garden-core.test.js tests/garden-server.test.js`.

## 9. Kill-switch e reversibilità

| Chiave | Effetto |
|---|---|
| `mappai_dungeon_visible = '1'` | ripristina la voce menu «Importa piano Dungeon» in MappAI |
| `mappai_games_enabled = '1'` | ripristina il launcher 🎮 del Memory Dungeon (com'era già) |

Il codice del Memory Dungeon (e i suoi 250 test) è INTATTO: il pivot ha solo
nascosto gli entry point. File nuovi del Garden: `garden-server.js`,
`public/js/mappai-garden-core.js`, `tools/voxel-proto/garden.{html,js}`,
`public/js/vendor/qrcode-generator.js`, test relativi.

## 10. Per chi crea i template (Giacomo)

- Lato mappa ≤ **64** (cap del loader); consigliato 32-48.
- Un giardino accogliente: prato + laghetto + qualche muro scenico FUORI dalle
  parcelle; le parcelle come radure delimitate.
- Salvare i template in `tools/voxel-proto/maps/garden_*.json` (export JSON
  dall'editor) — lo Studio li potrà proporre come «da file».
- Le texture usate dal template devono stare nella libreria del docente al
  momento dell'avvio sessione (viaggiano nel bundle).
