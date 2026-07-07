# Mappe del Memory Dungeon nel vault — Contratto dati, ruleset e validatore

> Documento di **design** (6 luglio 2026). Nessun codice: definisce solo i formati
> dati che gioco, editor (`tools/voxel-proto`) e vault si scambiano.
> Obiettivo: piani del dungeon **disegnabili/modificabili e persistiti nel vault**,
> con coinvolgimento di docenti/OPI e studenti nell'authoring degli ambienti.
> Prerequisiti: §17 (Studio Attivo nel dungeon), §19 (voxel 3D) di
> [`MEMORY_DUNGEON_DESIGN.md`](MEMORY_DUNGEON_DESIGN.md); contratto celle bozzato in
> [`tools/voxel-proto/README.md`](../../tools/voxel-proto/README.md).

---

## 0. Principio guida — tre livelli separati

La confusione da evitare: mettere le regole di validazione dentro ogni file mappa.
Vanno tenute distinte tre cose, ciascuna in un posto solo:

| Livello | Cos'è | Dove vive | Chi lo tocca |
|---|---|---|---|
| **Contratto** | i DATI di UNA mappa (dove sta cosa) | `Memory Dungeon/piani/piano-N.json` nel vault | editor / gioco (export) |
| **Ruleset** | le REGOLE di validazione (soglie) | `Memory Dungeon/ruleset.json` (uno per vault) | docente/OPI |
| **Codice di gioco** | regole di giocabilità non negoziabili | `mappai-games.js` | solo sviluppo |

**Perché.** Se "distanza minima 40" è scritta in ogni mappa, cambiarla significa
editare tutte le mappe. Nel ruleset è un'unica riga, e il docente tara la difficoltà
per la classe senza toccare le mappe degli studenti. Le mappe restano **portabili**
(nessuna regola incorporata) e il codice resta **inviolabile** (nessuno può salvare
un livello ingiocabile).

**Regola d'oro contenuto ≠ struttura.** Lo studente disegna l'AMBIENTE (muri, acqua,
quote, asset, estetica) e decide DOVE stanno le cose. Il gioco riempie gli slot con
le memory unit VERE (i nodi del livello) a runtime. Una mappa non nomina mai un nodo
specifico → non diventa obsoleta quando la MindMap cambia.

---

## 1. Layout nel vault

```
~/Documents/MappAI - Vault/{nome}/
├── Nodi/*.md              ← la MindMap (invariato)
├── links.json             ← (invariato)
├── Studio Attivo/
│   ├── sessioni.jsonl      ← storico sessioni (invariato)
│   └── mastery.json        ← padronanza EWMA (invariato)
└── Memory Dungeon/                ← NUOVO (opzionale: assente = tutto procedurale come oggi)
    ├── ruleset.json        ← regole di validazione (1 per vault)
    ├── materiali.json      ← texture pixel-art + materiali (1 per vault, opzionale — §2-quater)
    └── piani/
        ├── piano-0.json    ← un file per piano custom
        ├── piano-2.json    ← i piani senza file → Digger procedurale (fallback)
        └── ...
```

I nomi `piano-N` seguono l'indice di piano del dungeon (`DUN.fi`). Un piano senza file
custom si genera come oggi. La cartella `Memory Dungeon/` assente ⇒ comportamento identico
all'attuale: zero rottura per i vault esistenti.

**Aggiornamenti 6 luglio 2026 (implementati):**
- La cartella si chiama **`Memory Dungeon/`** (rinominata da `Dungeon/` prima di qualunque
  rilascio — nessun vault legacy da migrare).
- `save-map-vault` la crea **di default** (con `piani/` e un `LEGGIMI.md` per studenti)
  a ogni salvataggio vault. Vuota = nessun effetto.
- **Nome file libero**: il loader lega il file al piano dal nome `piano-N.json` SE presente,
  altrimenti dal campo `"id"` interno (`"piano-N"`). Un file ricevuto da docente/compagno
  si droppa in `piani/` senza rinominarlo. Due file per lo stesso piano → vince il più
  recente (mtime), con warning in console.

---

## 2. Contratto — file di un piano (`piano-N.json`)

Estende il contratto celle del voxel-proto con **slot tipizzati** e il **binding al
livello**.

```jsonc
{
  "schema": "mappai-dungeon-floor@1",
  "id": "piano-2",
  "level": 2,               // BINDING: gli slot "memory" si legano ai nodi di QUESTO livello
  "kind": "misto",          // misto | combat | giardino | scuola | radura
  "size": 20,               // tile logici per lato (4–64)
  "sub": 3,                 // voxel visivi per tile
  "seed": 20260706,

  // AMBIENTE (disegnato dallo studente/docente) — celle assenti = void (fuori mappa)
  // `mat` (opzionale, 7 luglio 2026): nome di un materiale (§2-quater) → texture
  // pixel-art su top dei pavimenti e top+lati dei muri. Assente = colori come oggi.
  "cells": [
    { "x": 0, "z": 0, "biome": "floor", "quota": 0,     "alt": 0, "blocca": false, "mat": "erba" },
    { "x": 11,"z": 9, "biome": "water", "quota": -0.62, "alt": 0, "blocca": true  },
    { "x": 4, "z": 5, "biome": "wall",  "quota": 0,     "alt": 2, "blocca": true,  "mat": "roccia" }
  ],
  // SEMANTICA `quota` (design §21, implementata 7 luglio 2026 — movimento quota-aware):
  // il dislivello tra celle adiacenti governa il passo del player. |Δquota| ≤ 0.9 si
  // cammina · salita 0.9–1.6 = salto automatico (arco 0.32s) · discesa 0.9–1.6 =
  // ease-down · |Δquota| > 1.6 = BLOCCATO nei due versi (DQ0: la caduta da dirupi
  // alti è vietata → niente softlock per costruzione). Una rupe > 1.6 è un muro a
  // tutti gli effetti: validatore, zone del mondo (§11) e pathfinding la trattano
  // così. I mob sono territoriali: si muovono e ingaggiano solo con |Δquota| ≤ 0.9
  // (DQ1). Piani senza quota (o tutta 0) = griglia piatta, comportamento storico.
  // Kill-switch runtime: localStorage `mappai_dungeon_quota` = '0'.

  // ASSET voxel piazzati (decor). Proprietà d'istanza opzionali (7 luglio 2026,
  // default = comportamento storico): yOff (altezza dal suolo, >0 fluttua con bob),
  // billboard (gira verso la camera; default ancorato al mondo), scale (1), rot
  // (0|90|180|270), walkable (true = NON blocca la cella), light ({color,intensity,
  // range,flicker} = punto luce agganciato). La regola di piazzamento `surface`
  // (floor/water/any) vive solo nella libreria dell'editor, non nel piano.
  // Ogni cubo può avere (7 luglio 2026, opzionali): `m` = nome materiale (§2-quater)
  // e/o `f` = override texture per faccia { top|bottom|nord|sud|est|ovest:
  // "nome-texture" | "#tag" } — "#tag" = scelta RANDOM DETERMINISTICA (seed dalla
  // posizione) tra le texture che portano quel tag.
  "props": [
    { "name": "torretta", "x": 5.6, "z": 7.6,
      "cubes": [ { "x": 0, "y": 0.5, "z": 0, "s": 1, "c": "#8f563b", "m": "roccia", "f": { "top": "#erba" } } ],
      "yOff": 0, "billboard": false, "scale": 1, "rot": 0, "walkable": false }
  ],

  // SLOT tipizzati — POSIZIONE fissa, CONTENUTO dinamico (riempito dal gioco a runtime)
  "slots": [
    { "type": "spawn",      "x": 2,  "z": 5  },
    { "type": "stairs",     "x": 17, "z": 3  },
    { "type": "gatekeeper", "x": 10, "z": 10 },   // solo ultimo piano
    { "type": "memory",     "x": 6,  "z": 4  },   // qui va UNA memory unit del livello 2
    { "type": "memory",     "x": 12, "z": 8  },
    { "type": "enemy",      "x": 8,  "z": 12 }
  ],

  "meta": { "author": "studente:mario", "title": "Le cellule — piano 2", "created": "2026-07-06" }
}
```

### Tipi di slot (v1)
| type | cardinalità | riempito a runtime con | note |
|---|---|---|---|
| `spawn` | esattamente 1 | posizione di partenza dell'eroe | obbligatorio |
| `stairs` | 1 (0 sull'ultimo piano) | scala di discesa | anti-softlock |
| `gatekeeper` | 1 solo ultimo piano | Guardiano della Memoria (boss) | |
| `memory` | N = memorie del livello | un nodo-con-contenuto del `level` | vedi §5 riempimento |
| `enemy` | 0…max | un mob (duello F/J) | cap dal ruleset |

### Regole del contratto
- Gli slot `memory` **non nominano** un nodo: dichiarano solo "qui va una memoria".
  Il legame nodo↔slot avviene a runtime (§5), guidato dal campo `level`.
- Estensione opzionale futura: `{ "type": "memory", "x":…, "z":…, "nodeHint": "n_abc" }`
  — binding SOFT per mappe curate dal docente ("questa stanza parla di fotosintesi");
  ignorato se il nodo non esiste più. Non necessario per la v1.
- Coordinate slot in **tile logici** (interi); i `props` in coordinate frazionarie.

---

## 2-bis. Pacchetto classe (`mappai-dungeon-bundle@1`) — implementato 7 luglio 2026

Più piani in un file unico, per la condivisione docente → classe. Esportato dallo
Studio (landing → «Pacchetto classe»), importato in MappAI dallo stesso «Importa
piano Dungeon» (ogni piano è validato coi nodi correnti; i validi vengono scritti,
gli scartati riportati in console).

```jsonc
{
  "schema": "mappai-dungeon-bundle@1",
  "title": "Le cellule — pacchetto piani",
  "author": "docente:rossi",       // facoltativo
  "created": "2026-07-07",
  "floors": [ { /* piano-N.json completo, contratto §2 */ }, { /* ... */ } ]
}
```

Niente palette/luci nel bundle (v1): il tema visivo resta fuori dal contratto.
**Esteso 7 luglio 2026**: il bundle può portare `"materials": { …contenuto di
materiali.json… }` — le texture delle facce viaggiano coi piani (l'import in MappAI
scrive `Memory Dungeon/materiali.json` nel vault dello studente).

---

## 2-quater. Texture e materiali (`materiali.json`) — implementato 7 luglio 2026

Un file per vault. **Texture** = risorsa (PNG pixel-art disegnata nell'editor Pixel,
con tag); **materiale** = ricetta riusabile che assegna texture (o `#tag`) alle facce.
I materiali si richiamano dalle celle della mappa (`cells[].mat`) e dai cubi degli
asset (`cubes[].m`, override per-faccia `cubes[].f`). Assente ⇒ tutto a colori.

```jsonc
{
  "schema": "mappai-dungeon-materials@1",
  "textures": {
    "erba-01":   { "size": 16, "png": "data:image/png;base64,…", "tags": ["pavimento", "erba"] },
    "erba-02":   { "size": 16, "png": "…", "tags": ["pavimento", "erba"] },
    "roccia-01": { "size": 16, "png": "…", "tags": ["pavimento", "muro", "roccia"] }
  },
  "materials": {
    "erba":   { "color": "#4a7a3a", "faces": { "top": "#erba", "side": "#terra", "bottom": null }, "tags": ["pavimento"] },
    "roccia": { "color": "#6f6b62", "faces": { "all": "#roccia" }, "tags": ["pavimento", "muro"] }
  }
}
```

- Riferimento faccia: `"nome-texture"` (diretta) oppure `"#tag"` = scelta **random
  deterministica** (seed dalla posizione: la mappa veste sempre uguale, niente
  sfarfallio tra rebuild) tra le texture che portano quel tag.
- Scorciatoie facce: `all`, `side` (le 4 laterali), `top`, `bottom`; singole facce
  (`nord`/`sud`/`est`/`ovest`) come override. `color` = fallback per le facce senza texture.
- Implementazione condivisa editor↔proto: `tools/voxel-proto/voxel-materials.js`
  (risoluzione riferimenti, cache texture NearestFilter, cubi a 6 materiali, batcher
  di quad — 1 draw call per texture sul terreno).
- Rendering (7 luglio 2026): top dei pavimenti, top+lati esposti dei muri, tutte le
  facce dei cubi (asset). Acqua esclusa (v1). La skin voxel dell'app li renderà in F2.

---

## 3. Ruleset (`ruleset.json`) — uno per vault

Le soglie di validazione, modificabili dal docente/OPI. Assente ⇒ default hardcoded.

```jsonc
{
  "schema": "mappai-dungeon-ruleset@1",
  "memory": {
    "coverage": "all",        // "all" = tutte le memorie del livello | { "min": 3 }
    "minSpacing": 40,          // distanza minima tra due slot memory (UNITÀ: vedi §3.1)
    "maxPerRoom": null         // alternativa a minSpacing (richiede rilevamento stanze) — off in v1
  },
  "enemies": { "max": 6 },
  "required":          ["spawn", "stairs"],   // slot obbligatori su ogni piano
  "requiredLastFloor": ["gatekeeper"],
  "severity": {                // come tratta il validatore ogni regola pedagogica
    "minSpacing": "warning",   // "error" blocca il salvataggio | "warning" segnala e passa
    "coverage":   "error",
    "enemiesMax": "error"
  }
}
```

### 3.1 Nota sull'unità di `minSpacing` (decisione da fissare)
"40 blocchi" è ambiguo: 1 tile logico = `sub` (3) voxel/"blocchi" visivi. Quindi
40 blocchi ≈ 13 tile. Su una mappa 20×20 questo è quasi sempre soddisfabile; su una
12×12 no. **Decisione consigliata**: esprimere `minSpacing` in **blocchi** (unità che
lo studente percepisce, coerente con l'editor voxel) e far sì che il validatore, se la
regola è **insoddisfabile** date size e numero di memorie, la **rilassi con warning**
invece di bloccare (altrimenti mappe piccole diventano invalidabili).

---

## 4. Validatore — input e output

**Input**: un `piano-N.json`, il `ruleset.json`, e i nodi correnti del `level`
(per calcolare quante memorie servono). **Non** modifica nulla: produce un verdetto.

```jsonc
{
  "ok": false,
  "errors": [                         // bloccano il salvataggio
    { "code": "memory-missing", "msg": "Piazzate 3 memorie su 5 richieste dal livello 2", "need": 5, "have": 3 },
    { "code": "stairs-unreachable", "msg": "Le scale non sono raggiungibili dallo spawn" }
  ],
  "warnings": [                       // segnalano ma passano
    { "code": "memory-too-close", "msg": "Due memorie a 22 blocchi (min 40)", "at": [[6,4],[8,6]] }
  ]
}
```

### 4.1 Controlli di GIOCABILITÀ (sempre error, dal codice — mai disattivabili)
1. `spawn` presente ed è **esattamente uno**.
2. `stairs` presente (tranne ultimo piano) e **raggiungibile dallo spawn** — BFS
   quota-aware sulle celle calpestabili (`reachableCells` in mappai-dungeon-core:
   rispetta `blocca` E i dislivelli > 1.6, stessa raggiungibilità del gioco).
3. `gatekeeper` presente e raggiungibile **solo sull'ultimo piano**.
4. Nessuno slot su cella `void` o `blocca` (memoria/scala dentro un muro = irraggiungibile).
5. Almeno una cella `floor` calpestabile (mappa non completamente scavata).

In più (warning, non blocca): `slot-unreachable` — slot memory/enemy su cella
calpestabile ma isolata dallo spawn da muri o dislivelli > 1.6.

### 4.2 Controlli PEDAGOGICI (severità dal ruleset)
6. **Coverage**: `slot memory piazzati == memorie richieste dal livello` (o `>= min`).
   → **è la tua regola "tutte le memorie piazzate prima di validare"**. Il numero è
   DINAMICO: `richieste = nodi del level con contenuto` (stesso `_hasContent` del gioco),
   mai scritto nella mappa.
7. **Anti-clustering**: ogni coppia di slot `memory` a distanza `>= minSpacing`.
8. **Cap nemici**: slot `enemy` `<= enemies.max`.

Consiglio (già concordato): usare la **regola distanza** (7) e lasciare `maxPerRoom`
disattivata in v1 — "max 1 per stanza" richiederebbe di rilevare le stanze
(flood-fill delle aree di pavimento separate da muri), che nel modello a celle libere
del voxel-proto non esistono. La distanza dà lo stesso effetto (spargere il richiamo)
senza definire il concetto di stanza.

---

## 5. Riempimento slot a runtime (binding memoria↔livello)

Quando il gioco carica `piano-N.json`, `_loadFloor` riempie gli slot invece di usare
il Digger:

1. `richieste = nodi del MAP con level == floor.level e contenuto` (ordinati, es. per padronanza crescente → i più deboli emergono per primi).
2. Ordina gli slot `memory` (per posizione, deterministico).
3. Assegna nodo→slot in ordine. Ogni slot memory diventa una sorgente (libro/scroll/vaso)
   con quel nodo, come oggi fa `_loadFloor` con le celle random del Digger.
4. `spawn`→`DUN.px/py`, `stairs`→`DUN.sx/sy`, `gatekeeper`→`DUN.boss`, `enemy`→`_spawnMobs`.

### Degradazione graziosa (staleness — come le voci "ghost" del diario)
- **Validazione al SALVATAGGIO** = blocco duro: lo studente deve aver piazzato tutte
  le memorie ⇒ coverage garantita al momento della creazione.
- **Caricamento TOLLERANTE**: se la MindMap è cambiata dopo,
  - nodi del livello **in più** rispetto agli slot → restano non piazzati (log, oppure
    fallback: sparsi su celle floor libere) — nessun crash;
  - slot **in più** rispetto ai nodi → restano vuoti (skippati);
  - il **livello non esiste più** nella mappa → il piano ricade sul Digger procedurale.

---

## 6. Round-trip: autogenera → modifica → ricarica

Entrambe le direzioni che hai chiesto sono supportate dallo stesso contratto:

- **Disegna da zero e sostituisci l'autogenerato**: editor → disegni ambiente + slot →
  validi → salvi in `Memory Dungeon/piani/piano-N.json`. Al prossimo dungeon, quel piano usa
  il tuo disegno; gli altri restano procedurali.
- **Prendi l'autogenerato, modificalo, ricaricalo**: il gioco esporta il piano corrente
  nel contratto (da `DUN.map` la conversione celle è diretta, gli slot vengono dalle
  posizioni runtime di sorgenti/scale/boss/spawn) → apri nell'editor → ritocchi → risalvi.
  Il pulsante "Copia JSON mappa" del voxel-proto è già metà di questo flusso.

**Priorità sorgenti mappa** (già implementata nel voxel-proto, da portare nel gioco):
`?map=` esterno → `Memory Dungeon/piani/piano-N.json` (vault) → mappa curata app (giardino) →
Digger procedurale.

---

## 7. Compatibilità §17 (condotti / mimic / archivio)

Le sfide §17 hanno riferimenti **tra piani** (il condotto ⚡ collega due piani; il mimic
🎭 pesca da un altro piano). Due strade:

- **v1 (consigliata)**: le sfide §17 restano **auto-piazzate dal gioco** (come oggi in
  `_placeS17`), NON disegnabili. Lo studente disegna ambiente + slot base; il gioco
  aggiunge condotti/mimic dove serve. Semplice, zero riferimenti cross-file da validare.
- **Futuro**: slot `{ "type": "conduit", "pairId": "c1" }` — due condotti con lo stesso
  `pairId` sono collegati; il validatore controlla che le coppie combacino. Da fare solo
  quando l'authoring §17 diventa una feature richiesta.

---

## 8. Valutazione pedagogica (lenti: Tilemancer + game-based learning)

- **Idea forte**: costruire lo spazio del proprio materiale di studio è un atto
  **generativo**, non decorativo. Aggancio profondo col **metodo dei loci** (il Palazzo
  della Memoria, §19 F3): gli spazi che hai costruito tu si ricordano meglio. Per BES/DSA
  l'ownership vale doppio ("il MIO dungeon di storia").
- **Massimo valore didattico** se il vincolo spaziale **codifica significato**: se lo
  studente decide quale ramo abita quale zona e cosa confina con cosa, disegnare la mappa
  È ragionare sulla struttura della conoscenza (il defrag §17 rovesciato: dall'esame
  all'authoring). Se dipinge solo terreno grazioso, è engagement/ownership puro: legittimo
  ma più debole — da sapere in fase di design degli slot.
- **Ruoli, in ordine di potenza didattica**: docente/OPI cura i piani per la classe →
  studente personalizza → **studente-autore per i compagni** (peer teaching, il più forte).
- **Rischi e valvole** (pattern Tilemancer):
  - *time-sink* — l'editor può mangiare la sessione di studio. Valvola: asset/decorazioni
    come **ricompensa di gioco** (i forzieri danno pezzi da piazzare — "l'agency è la
    reward"), editing libero fuori dalle sessioni.
  - *softlock* — mappa senza percorso spawn→scale. Valvola: il validatore (§4.1) rifiuta
    con spiegazione; l'errore costa una correzione, mai la partita.

---

## 9. Ordine di implementazione (piccolo e reversibile a ogni passo)

1. ✅ **Contratto + loader nel gioco con fallback** — FATTO (6 luglio 2026, sera):
   - logica pura in `mappai-dungeon-core.js`: `planToGrid`, `normalizePlanSlots`,
     `assignMemorySlots` (+12 test in `tests/dungeon-floorplan.test.js`, suite 200/200)
   - IPC `load-dungeon-floors` in `main.js` (legge `Memory Dungeon/piani/piano-N.json` +
     `Memory Dungeon/ruleset.json`) + `electronAPI.loadDungeonFloors` in `preload.js`
   - `mappai-games.js`: `_vaultPlansFetch` all'avvio (parallela alla mappa giardino,
     cap 1.5s) → `DUN.vaultPlans`; `_loadFloor(i)` usa `_loadFloorFromPlan` se esiste
     `piani/piano-i.json`, con fallback procedurale su qualunque errore. Slot memory
     riempiti coi nodi del livello (deboli per primi), memorie senza slot → celle
     libere (staleness §5), nemici solo sugli slot (cap dal ruleset), §17 auto,
     scale/boss da slot o fallback. `DUN.floorPlan` esposto per la skin voxel (F2).
   - Kill-switch (default ON): `localStorage 'mappai_vault_floors'='0'`
   - Piano d'esempio pronto da copiare: [`esempi/piano-1.json`](esempi/piano-1.json)
     (verificato: slot tutti raggiungibili via BFS)
   - ⚠️ Non ancora testato nell'app Electron viva (solo unit test + validazione
     statica) — primo test manuale: copiare l'esempio in `<vault>/Memory Dungeon/piani/`
     e aprire il dungeon.
   - Nota indici: `piano-N` segue l'indice runtime `DUN.fi`, che include gli
     eventuali piani giardino/scuola in testa (documentato in §1).
2. **"Salva questo piano nel vault" dal gioco** — export runtime → JSON (round-trip §6).
3. **Editor apre/salva file del vault** — oggi l'editor usa solo localStorage; aggiungere
   apri-da-file e scrivi-nel-vault (IPC in `main.js`, come `savePDFToVault`).
4. **Slot didattici + validatore** — tipi slot (§2), ruleset (§3), validatore (§4),
   riempimento runtime (§5).
   - ✅ **Validatore FATTO** (6 luglio 2026): `validatePlan(plan, ruleset, levelNodeCount)`
     in `mappai-dungeon-core.js` (pura, +15 test in `tests/dungeon-floorplan.test.js`).
     Output conforme a §4. Codici errore: `contract-invalid`, `no-floor`, `spawn-missing`,
     `spawn-multiple`, `slot-blocked`, `stairs-missing`, `stairs-unreachable`,
     `stairs-on-last-floor`, `gatekeeper-multiple`, `gatekeeper-unreachable`,
     `memory-missing`, `memory-extra`, `memory-too-close`, `enemies-max`.
     Ultimo piano DEDOTTO dagli slot: gatekeeper presente = piano finale (0 scale).
     `levelNodeCount = null` ⇒ coverage saltata (conteggio ignoto al chiamante).
5. ✅ **Import in-app FATTO** (6 luglio 2026): menu azioni → «Importa piano Dungeon»
   (`window.MappAIGames.importFloorPlan`, input `#menu-import-floorplan` in index.html).
   Flusso: file .json → check schema+id → `validatePlan` coi nodi correnti del level e
   il ruleset del vault → conferma se sovrascrive → IPC `save-dungeon-floor` scrive
   `Memory Dungeon/piani/piano-N.json` (nome normalizzato dall'`id`). Errori mostrati
   con spiegazione (showAlert); warning in console. Lo studente non tocca mai il filesystem.
   **Esteso 7 luglio 2026**: accetta anche il pacchetto classe (§2-bis) — ogni piano
   validato singolarmente, conferma unica con riepilogo sovrascritture (`_importBundle`).
6. ✅ **Memory Dungeon Studio — landing FATTA** (7 luglio 2026):
   `tools/voxel-proto/studio.html` (entry della finestra Studio in main.js, preload
   agganciato). Pannelli:
   - **Nuova mappa**: progetto recente (localStorage `tutor_ai_projects`, origin file://
     condivisa con MappAI in Electron) o vault (IPC) → estrazione requisiti
     (`perLevelCounts`: nodi con desc/content per livello = memorie richieste) → scelta
     livello/kind/id/tela (piatta o bozza procedurale seedata) → editor.
   - **Apri vault**: menu piani con anteprima isometrica (canvas) e badge di validazione
     (✓/⚠/✗ da `validatePlan` + ruleset + conteggi reali); livelli senza piano = card
     "procedurale" con CTA Crea; form **regole del docente** (ruleset §3, IPC
     `save-dungeon-ruleset`); bottone Prova (proto col piano in `voxelproto_map`).
   - **Riprendi** (autosave editor), **Apri file** (piano singolo o bundle, con scelta
     vault di destinazione), **Solo asset** (hash `#voxel`/`#pixel`), **Genera bozza**
     (digger random-walk seedato), **Pacchetto classe** (IPC `export-dungeon-bundle`
     con dialog di salvataggio).
   - **Ponte con l'editor**: `voxelproto_plan_ctx` (id/level/kind/slots/meta/vaultPath/
     levelNodeCount/isLast/ruleset). L'editor mostra la barra vault, e al salvataggio
     ricompone il contratto §2, genera **SLOT AUTOMATICI** se assenti (spawn = prima
     cella libera, uscita = cella BFS più lontana — gatekeeper se `isLast`, memorie =
     K celle raggiungibili a massima dispersione), valida (§4) e scrive via IPC.
     Gli slot auto vengono persistiti nel ctx → salvataggi successivi stabili.
     L'editing MANUALE degli slot resta il punto E1 (non ancora fatto).

⚠️ iPadOS: la scrittura nel vault passa da `storageAdapter.js`, non da IPC Electron
diretto — verificare quando il punto 3 tocca la persistenza.

---

## 10. Decisioni — fissate e aperte

Fissate col validatore (6 luglio 2026, come da raccomandazioni):
- ✅ **Unità di `minSpacing`**: BLOCCHI (1 tile = `sub` blocchi); se la soglia è
  insoddisfabile per size/numero memorie la regola è rilassata a warning anche con
  severity `error` (§3.1).
- ✅ **`coverage`**: default `all` con uguaglianza esatta — memorie in eccesso segnalate
  (`memory-extra`), stessa severità di `coverage`. `{ "min": N }` resta disponibile.
- ✅ **Ordine di riempimento memory**: per padronanza crescente (già così in
  `_loadFloorFromPlan`).

Ancora aperte:
- **Authoring §17**: rimandato a dopo la v1 (§7).
```

---

## 11. Mappa-mondo (`mondo.json`) — contratto `mappai-dungeon-world@1` (implementato W1, 7 luglio 2026)

> Design completo: [`MEMORY_DUNGEON_DESIGN.md`](MEMORY_DUNGEON_DESIGN.md) **§20**.
> Decisioni §20.9: D1 binding docente+fallback capienza · D2 gate default coverage 0.6
> + quiz 2 · D3 ordine dalla topologia · D4 file separato · D5 cap 64 · D6 solo voxel ·
> D7 giardino = zona spawn. W1 = questo contratto + logica pura; W2 runtime, W3 authoring.

Un file per vault: `Memory Dungeon/mondo.json`, coesiste coi piani. Una MAPPA UNICA
grande al posto della pila di piani: le **zone** (aree di pavimento contigue, rilevate
per **flood-fill** — mai disegnate a mano) si legano alle **macro-aree L1** della
MindMap; i **gate** sono slot su celle di passaggio che bloccano finché il requisito
non è soddisfatto.

```jsonc
{
  "schema": "mappai-dungeon-world@1",
  "size": 64,                      // cap v1 (D5)
  "sub": 3,
  "seed": 20260707,
  "cells": [ /* IDENTICHE a §2: biome/quota/alt/blocca/mat */ ],
  "props": [ /* IDENTICI a §2: cubes m/f, yOff/billboard/scale/rot/walkable/light */ ],

  // dichiarazioni zona: anchor = una cella DENTRO l'area; branchHint = binding SOFT
  // al ramo L1 (match fuzzy sul label; ignorato se il ramo non esiste più — staleness §5)
  "zones": [
    { "id": "giardino", "anchor": { "x": 8, "z": 8 },  "branchHint": null },
    { "id": "foto",     "anchor": { "x": 40, "z": 30 }, "branchHint": "Fotosintesi" }
  ],

  "slots": [
    { "type": "spawn",  "x": 8,  "z": 6 },                     // 1 solo: il giardino (D7)
    { "type": "memory", "x": 10, "z": 9 },                     // zona implicita (area in cui sta)
    { "type": "gate",   "x": 20, "z": 14, "req": { "coverage": 0.6, "quiz": 2 } },
    { "type": "gatekeeper", "x": 60, "z": 58 }                 // boss di mondo, opzionale (0..1)
  ],
  "meta": { "author": "docente:rossi", "title": "Il mondo della biologia" }
}
```

### 11.1 Gate — requisito `req`
Valutato sulla zona DA CUI si proviene. Campi (tutti opzionali, default D2
`{ coverage: 0.6, quiz: 2 }` se `req` assente o non valido):
`coverage` (0..1, frazione memorie della zona catturate) · `quiz` (int ≥1, domande del
guardiano sul ramo — pipeline gatekeeper) · `mastery` (0..1, EWMA del ramo).
Aperto = resta aperto. Un gate valido tocca ESATTAMENTE 2 aree (`gate-not-boundary`).

### 11.2 Logica pura (implementata in `mappai-dungeon-core.js`, +17 test)
- **`worldZones(plan)`** — flood-fill deterministico delle aree camminabili (i gate
  tagliano), match delle anchor dichiarate, conteggi memory/enemy per zona, gate→zone
  adiacenti. Ritorna `{grid, zones, gates, byCell, spawnIdx, …}`.
- **`bindZones(zones, branches)`** — D1: prima gli hint (fuzzy sul label), poi capienza
  (zona con più slot ↔ ramo con più memorie), deterministico. `branches` =
  `[{label, count}]` (nodi con contenuto per ramo L1).
- **`validateWorld(plan, ruleset, branches)`** — output come §4. Errori: `contract-invalid`,
  `no-floor`, `spawn-missing/multiple`, `slot-blocked`, **`gate-not-boundary`**,
  **`zone-unreachable`** (BFS con porte sul grafo delle zone), `gatekeeper-multiple`.
  Warning: **`gate-req-invalid`** (→ default D2), **`zone-no-memory`** (zona spawn
  esente: è il giardino). Pedagogia con severità dal ruleset (§3): **coverage per ZONA**
  (`zone-memory-missing/extra`, richieste = memorie del ramo legato), cap nemici globale.

### 11.3 Runtime W2 — implementato 7 luglio 2026
- **Loader**: `load-dungeon-floors` legge anche `mondo.json` → `out.world`. Il gioco
  parte in modalità mondo se presente + skin voxel attiva (D6: guard con fallback ai
  piani classici e toast). Kill-switch: `localStorage 'mappai_world_mode'='0'`.
- **`_loadWorld`** (mappai-games.js): zone detection via `worldZones`, binding via
  `bindZones` su `_branchGroups()` (nodi con contenuto per ramo L1, via `buildParentOf`),
  memorie del ramo → slot della zona (deboli per primi; staleness: nodi senza slot →
  celle libere DELLA STESSA zona), gate chiusi = celle bloccate, gatekeeper = boss,
  niente scale. `checkGateReq` (core, puro): sanifica il req e valuta coverage/mastery.
- **Gate runtime**: click sul 🚪 da vicino → coverage/mastery della zona corrente →
  quiz del guardiano (`_runQuiz`, pool = diario del ramo, fallback diario vivo; zona
  senza nulla da chiedere → si apre, mai blocco a vuoto). Aperto = cella sbloccata,
  `DUN.worldRev++` → la skin voxel ricostruisce (porta sparisce).
- **Minimappa a zone** (§20.5): canvas in alto a destra — bolle = zone (colore del
  ramo, scure se non ancora raggiungibili coi gate aperti), archi = gate
  (verde aperto / tratteggio chiuso), anello = zona corrente.
- Esempio pronto: [`esempi/mondo.json`](esempi/mondo.json) (giardino-hub + 2 zone,
  validato). ⚠️ Non testato in Electron vivo.

### 11.4 Da fare (W3-W4, design §20.8)
Authoring (pennello gate nella Pianta, requisiti per RAMO nello Studio, pannello zone
in editor) → polish (bussola, fog per zona sulla minimappa, condotti tra zone, NPC
Sapienti nella zona giardino).
