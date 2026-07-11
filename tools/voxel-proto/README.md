# Voxel Proto — Memory Dungeon 3D → Knowledge Garden

Prototipo standalone (6 luglio 2026) per la nuova direzione grafica del Memory Dungeon:
**ambiente 3D a volumi flat senza texture + characters/NPC/item come sprite 2D billboard**.
Zero modifiche al gioco attuale — tutto vive in questa cartella.

> **Pivot 10 luglio 2026 — Knowledge Garden.** Il dungeon è accantonato; l'editor
> vive come ambiente creativo bonus. Nuova pagina **`garden.html` + `garden.js`**
> (fork di proto.js): giardino espositivo di classe con parcelle disegnate dal
> docente (pennello 🌱 nell'editor), creator mode in-parcella (texture, muri ≤10,
> rilievo, oggetti), targhetta obbligatoria, muri cutaway. Sessione LAN dal PC
> docente (Studio → card 🌱, QR per gli studenti, archivio in cartelle locali).
> Docs complete: `docs/knowledge-garden.md`. Dev mode senza server:
> `garden.html?map=maps/giardino_voxel.json&dev=1&plot=5`.

## Come avviare

Serve un server HTTP dalla **root del repo** (le texture sono in `public/assets/`):

```bash
cd "MappAI re"
python3 -m http.server 8137
# → http://localhost:8137/tools/voxel-proto/
```

Three.js r164 è **vendored** (`public/js/vendor/three-r164.module.min.js`, import map
relativo) — funziona offline e nella finestra Studio di Electron. Niente CDN.

## Comandi

| Input | Azione |
|---|---|
| Click sinistro | point & click: pathfinding BFS sulla griglia logica, cammino continuo, marker sulla destinazione |
| Frecce / WASD | movimento libero continuo (input relativo alla camera, annulla il point & click) |
| Q / E (o bottoni) | ruota camera di 90° — vista isometrica sempre preservata |
| Rotella | zoom (frustum ortografico) |
| O | cicla ombre: dure → morbide → blob |
| Copia JSON mappa | esporta `window.MAP_DATA` negli appunti |

## Decisioni architetturali dimostrate

1. **Griglia logica intatta, movimento svincolato** — biomi, collisioni, acqua che
   blocca e dislivelli vivono sulla griglia 16×16 come `mappai-dungeon-core.js`,
   ma il personaggio si muove in **coordinate mondo continue** (raggio di collisione
   0.42, scivolamento lungo gli ostacoli per assi separati). Il point & click usa
   BFS sulla griglia per i waypoint e rifinisce l'ultimo tratto sul punto esatto
   cliccato (libertà sub-tile). Il 3D è solo presentazione.
2. **1 tile logico = 3×3 voxel visivi** — l'occhio non vede più il modulo del tile,
   il pathfinding sì. Jitter di quota per-voxel (seedato → riproducibile).
3. **Biomi = colore + quota**: acqua con offset z negativo variabile per cella,
   blocca il passaggio; pavimento con micro-variazioni z positive. **Dislivelli
   asimmetrici** (7 luglio 2026): si SALE camminando fino a `STEP_UP_WALK` (0.9,
   gradini z<1) o col SALTO automatico fino a `STEP_UP_JUMP` (1.6, gradini ~z+1),
   oltre è bloccato; si SCENDE senza limiti (si cade dai bordi dei pendii). Mai
   in acqua/lava/vuoto (sono `blocca`) → il personaggio non cade mai in un liquido
   o fuori mappa. `stepKind(fromQuota, wx, wz)` → `walk|jump|blocked`; l'arco di
   salto è un mezzo-seno di ~0.32s.
4. **Billboard cilindrici** — sprite ruotano solo su Y, sempre rivolti alla camera
   (modello Don't Starve). PNG reali dal repo (`public/assets/`), NearestFilter,
   ritaglio UV dai fogli sprite (rogue8x8: celle 8×8 + separatore 1px).
5. **Ombre parametriche** — dure (`BasicShadowMap`) / morbide (`PCFSoftShadowMap`) /
   blob (ellisse sotto lo sprite, più leggibile per BES/DSA). Gli sprite proiettano
   ombra ritagliata via `customDepthMaterial` + `alphaTest`.
6. **Performance**: tutti i volumi in `InstancedMesh` (solidi + acqua + lava) →
   ~2.500 volumi, una manciata di draw call. `frustumCulled = false` su queste
   mesh: la sfera di delimitazione di una InstancedMesh è calcolata sul box unitario,
   così pozze/isole (istanze localizzate) venivano cullate — e sparivano — a certe
   rotazioni/zoom. Disattivare il culling è gratis (poche mesh, terreno quasi sempre
   a schermo).
7. **Liquidi animati** (7 luglio 2026): acqua e lava (mat taggato `lava`, resa come
   liquido incassato con glow emissive) oscillano in altezza ±0.1 con onde sfasate
   per cella (`animateLiquids`, aggiorna la Y del top delle istanze nel loop).

## Editor (`editor.html`)

Quattro schede, stessa scena del gioco. Palette e luci si salvano in localStorage
e **il gioco le legge a ogni avvio** (`voxelproto_palette`, `voxelproto_lights`):

1. **Colori** — palette dei volumi (pavimento A/B, muro A/B, acqua bassa/fonda,
   sfondo) + slider "varietà colore" e "jitter quota". Anteprima live, Salva/Reset/JSON.
2. **Luci** — luce ambiente, sole direzionale (intensità, colore, azimut, altezza)
   e punti luce piazzati col click sul terreno: colore, intensità, raggio,
   sfarfallio (fuoco/torcia). Il gioco applica tutto, sfarfallio incluso.
3. **Mappa** — pennelli sulla superficie: Pavimento (con quota -1…2), Acqua,
   Muro (altezza 1-4), **Vuoto** (scava la mappa: forme non rettangolari, il
   buco è invalicabile e senza geometria), **⛰ Rilievo** (bump: alza/abbassa
   progressivamente la quota dei pavimenti nel raggio, con sfumatura ai bordi →
   colline dolci a pendii progressivi; intensità e raggio regolabili). Materiale
   pennello (materiale salvato) **oppure** «texture/tag» diretta sul pavimento:
   scegli una texture o un `#tag` e il pavimento dipinto riceve al volo un
   materiale `auto:<ref>` (top = quel riferimento). Dimensione griglia 12/16/24/32
   (ridimensiona preservando l'area comune). Piazzamento asset dalla libreria
   Voxel con click, in coordinate frazionarie (non grid-locked); l'asset rende
   invalicabile la cella su cui poggia. Salva → localStorage `voxelproto_map`,
   che il gioco carica a ogni avvio (priorità: `?map=` esterno → editor → demo).
4. **Voxel** — costruttore asset con **taglie miste**: cubo standard (1), 1/2 e
   1/3 mescolabili nello stesso modello; ogni cubo si aggancia alla griglia
   della propria taglia e i cubi si toccano faccia contro faccia lungo la
   normale cliccata. Area di lavoro 3/6/9 unità. Libreria in localStorage
   (`voxelproto_assets`), formato v2 `{name, version:2, cubes:[{x,y,z,s,c}]}`
   (il vecchio formato a griglia intera viene convertito al caricamento).
5. **Pixel** — editor sprite 2D: canvas 8/16/32, matita/gomma/secchiello/contagocce,
   palette DB32 (la stessa degli asset Aseprite del repo), carica PNG, esporta
   PNG 1× e 8×. Per lavori grossi resta la pipeline Aseprite (plugin pixel-mcp);
   questo è per ritocchi rapidi senza uscire dal browser.

## Collisione character/character

Cerchio vs cerchio sul piano: ogni entità solida ha un raggio (`solidEntities`
in proto.js — gatekeeper 0.7, NPC 0.55, eroe 0.42). Il controllo è per-asse come
quello contro i muri, quindi l'eroe scivola attorno ai personaggi invece di
incollarsi. La gemma non è solida: al contatto viene raccolta (toast).

## Texture pixel art sulle facce dei volumi (fattibile, futuro)

Sì, senza cambiare architettura: i volumi restano `InstancedMesh`, si aggiunge
una `map` al materiale (atlas di tile 16×16 con `NearestFilter`). Percorsi in
ordine di costo: (a) un `InstancedMesh` per materiale/bioma — zero shader custom;
(b) atlas unico + offset UV per-istanza via `onBeforeCompile` — una draw call.
Il vantaggio resta: niente autotiling, basta una tile piastrellabile per bioma,
introducibile gradualmente (es. solo i top del pavimento) e sempre revocabile.

## Contratto dati mappa (draft per la pipeline mapgen)

```json
{
  "seed": 20260706,
  "size": 16,
  "sub": 3,
  "cells": [
    { "x": 0, "z": 0, "biome": "floor", "quota": 0, "alt": 0, "blocca": false },
    { "x": 11, "z": 9, "biome": "water", "quota": -0.62, "alt": 0, "blocca": true },
    { "x": 4,  "z": 5, "biome": "wall",  "quota": 0, "alt": 2, "blocca": true }
  ],
  "entities": [
    { "id": "hero", "sprite": "rogue8x8/Girl-Melee", "x": 2, "z": 5 }
  ]
}
```

- `quota` — offset verticale del piano calpestabile (unità voxel; acqua: negativo)
- `alt` — altezza del volume (solo `wall`)
- `blocca` — collisione gameplay
- `biome: "void"` — cella fuori mappa: nessuna geometria, invalicabile.
  Le celle assenti dal JSON delle mappe editor sono void → forme non rettangolari
- `size` — lato griglia dinamico (4–64), la camera e le ombre si adattano
- `props` — asset voxel piazzati: `{ name, x, z, cubes: [{x,y,z,s,c}] }`,
  posizione frazionaria, `s` = lato cubo (1, 0.5, 1/3 mescolabili).
  **Proprietà d'istanza opzionali (7 luglio 2026)** — default = comportamento storico:
  - `yOff` (num, 0): altezza dal suolo; > 0 = fluttua, con bob sinusoidale nel render
  - `billboard` (bool, false): gira verso la camera; default ancorato al mondo (ruota con la mappa)
  - `scale` (num, 1) e `rot` (0|90|180|270): trasformazioni per-istanza dal piazzamento
  - `walkable` (bool, false): calpestabile — NON rende invalicabile la cella d'appoggio
  - `light` (`{color,intensity,range,flicker}`): punto luce agganciato all'asset
  La proprietà `surface` (dove si può piazzare: floor/water/any) vive SOLO nella
  libreria asset (v3, `voxelproto_assets`): è una regola dell'editor, il piano salva il risultato.
- **Materiali e texture (7 luglio 2026)**: le celle accettano `mat` (nome materiale) e i
  cubi `m`/`f` (materiale / override texture per faccia, `"#tag"` = random deterministico).
  Definizioni in `Memory Dungeon/materiali.json` (contratto §2-quater); implementazione
  condivisa editor↔proto in [`voxel-materials.js`](voxel-materials.js) — top pavimenti,
  top+lati muri e facce dei cubi, 1 draw call per texture.
- Le entità hanno coordinate frazionarie: i decor NON sono grid-locked
- Sorgenti mappa in ordine di priorità: `?map=file.json` → editor
  (localStorage `voxelproto_map`) → demo hardcoded

La pipeline `tools/mapgen` in futuro produce questo JSON (generazione deterministica
+ eventuale AI solo per il layout logico); i PNG restano solo per characters & items.

## Mappe custom nel vault (design)

Il contratto dati qui sotto è la base per **piani del dungeon disegnati nell'editor e
salvati nel vault** (`Memory Dungeon/piani/*.json`), con validatore e slot didattici.
Design completo: [`docs/game-design/VAULT_DUNGEON_MAPS_CONTRACT.md`](../../docs/game-design/VAULT_DUNGEON_MAPS_CONTRACT.md).

## Integrazione futura nell'app

- Three.js come script globale nel renderer Electron (pattern `window.*`, no bundler)
- Sostituzione del renderer 2D del dungeon in `mappai-games.js`, core logico invariato
- Rotazione camera ad angoli fissi ok per iPadOS (nessuna dipendenza da IPC Electron)

## F0 — §19 (6 luglio 2026, sera)

Implementate e validate le decisioni di design §19 (MEMORY_DUNGEON_DESIGN.md):

- **Buio + lanterna** (default ON, tasto `L` per toggle): ambient minima, point light
  calda che segue l'eroe con sfarfallio; celle visitate restano tinteggiate (+45%).
- **Entità tipizzate** (contratto §19.2) rese come billboard emoji self-lit
  (landmark visibili nel buio): `source` (📖/📜/🏺), `condotto` ⚡, `server` 🖥,
  `pedestal` (disco colorato per macro-area), `stairs` 🔽.
- **Condotto-ponte**: avvicinarsi al terminale ⚡ chiude il circuito → le lastre
  sull'acqua si accendono ambra e diventano percorribili (`blocca:false`).
- **Boot del server**: avvicinarsi a 🖥 → luce globale del piano (buio OFF, persistente).
- Hook testabili senza rAF in `window.__protoDebug` (`checkStudyProximity`,
  `activateConduit`, `bootServer`, `studyEnts`, `conduits`) — i browser headless
  non pompano il loop di animazione.

F0 valida la SCENA, non il quiz: le domande (famiglia verbo, ordine boot) arrivano
con la F2 world-space nell'app.
