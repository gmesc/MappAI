# LoL Map Editor

Editor di mappe a tile per disegnare **stanze/mappe d'esempio** coi tileset Legend of Lua, da passare poi a Claude (PNG per vederla + JSON per le coord).

## Avvio
- **Doppio click** su `index.html` (i tileset sono embedded in `tilesets.js` → funziona offline, export incluso).
- Oppure servito: `python3 -m http.server 8142 --directory tools/assets-manager/map-editor` → http://localhost:8142

## Gruppi (dropdown "Gruppo")
- **Tiles · overworld / cave / inner** — tutti i tile dei 3 tileset (16px). Click → seleziona, **Pennello** dipinge celle sul layer tile attivo.
- **Vegetazione · Strutture · Personaggi · Item · Memory/Custom** — sprite (alberi, chest, door, npc, nemici, boss, gatekeeper, book/scroll…). Click su una thumbnail → **piazzi lo sprite** come oggetto ancorato (bottom-center sulla cella, può sporgere).

## Mix + Densità + Preset (base variata + overlay sparso)
Concetto: **base** = mix di erbe-base (riempimento uniforme variato); **fiori/sassi/dettagli** = **overlay sparso SOPRA**, non nel riempimento.

- **🎨 Mix**: clicca più **tile-variante** dello stesso elemento → evidenziate in ciano. Riempi/Pennello piazza un tile a caso dal set → niente pattern forte. **✕ mix** azzera.
- **dens** (densità): % di celle riempite. **100%** = base piena; **~8-15%** = overlay sparso (fiori/sassi) sul layer **Sopra** lasciando vedere l'erba sotto.
- **Preset** (1 click): 🌱 Erba base (mix erbe, 100%, Terreno) · 🌼 Fiori (overlay 14%, Sopra) · 🪨 Sassi (overlay 8%, Sopra). Punto di partenza: affina i tile col Mix.

**Workflow prato:** Preset Erba base → Riempi l'area (Terreno). Poi Preset Fiori → Riempi la stessa area (Sopra, sparso). Poi Sassi → Riempi (Sopra).

## 🧱 Terreno (autotiling)
Scegli il terreno nel menu accanto al tool **🧱 Terreno** e dipingi: i bordi si scelgono da soli.
- **Siepe** — edge-4bit dal blocco 3×3 del tileset (angoli/lati/centro + cap 1-wide); va su layer Sopra, l'erba resta sotto.
- **Muro dungeon** — regola-Zelda: *front se sotto non c'è muro, altrimenti cap*. 2 tile → muro 3D su qualunque forma.
- **Laghetto** — acqua base su Terreno + rive **overlay trasparenti** su Sopra (il centro del set è trasparente). Nota: le rive portano erba chiara "baked" → matcha meglio su erbe chiare.
La **Gomma** su una cella-terreno rimuove e ri-risolve i vicini. Teoria: skill `pixel-art-tilemaps` + `atlas/tileset_atlas.json → terrains`.

## ⚙️ Editor schemi autotile (crea nuovi terreni senza coordinate a mano)
Bottone **⚙️ Schemi** → pannello:
1. **Nome** + **Tipo**: `edge-4bit` (siepi/recinti/sentieri, 16 slot) · `muro-Zelda` (2 slot: TOP/FRONT) · `riva-overlay` (acqua + 8 rive).
2. Clicca uno **slot**, poi il **tile** nella palette → assegnato (thumbnail nello slot).
3. **🧩 Auto da blocco 3×3**: clicca l'angolo alto-sx del blocco nel tileset → 9 ruoli assegnati in un colpo (i pack li spediscono così).
4. L'**anteprima** mostra un blob di prova risolto in tempo reale. Slot vuoti (edge4) → fallback sul centro. Il layer (Terreno/Sopra) è auto-rilevato dalla trasparenza del tile centro.
5. **💾 Salva** → lo schema appare nel menu del pennello 🧱 (persistito in localStorage). **⬇ Esporta JSON** → `terrains.json` in formato atlas (per `tileset_atlas.json → terrains` e, in prospettiva, per l'autotiling del renderer di gioco).

## Blocchi multi-tile (case/fontane/statue)
Nel gruppo tileset, **trascina un rettangolo** sulla palette per selezionare un **blocco** di tile (es. tutta la casa). Poi clicca sulla mappa → stampi il blocco intero in un colpo (ancorato in alto-sx). Drag di 1 tile = tile singolo come sempre.

## Trasparenza / layer automatico
I tile con **pixel trasparenti** (cespugli, sassi, fiori, tetti…) vanno **automaticamente sul layer Sopra**, così sotto resta l'erba (niente riquadri neri). I tile pieni (erba, acqua, muri, pavimenti) restano sul layer selezionato. Lo sfondo scuro della palette è solo il backdrop di riferimento.

## Uso
- **Tool**: Pennello (tile: dipingi+trascina; blocco/sprite: piazza) · Gomma (toglie sprite in cima, poi tile Sopra, poi Terreno) · Riempi (bucket; con Mix = variato) · Preleva (eyedropper tile/sprite).
- **Layer tile**: Terreno (sotto) + Sopra. Gli **sprite** stanno in una lista oggetti separata, disegnati sopra in y-order.
- **Mappa**: ridimensiona, Svuota, Zoom, griglia.
- **Esporta**: `⬇ PNG` (flatten, per mostrarla) · `⬇ JSON` (per le coord). `⬆ Importa`.

## Formato JSON (v2)
```json
{ "version":2, "tile":16, "cols":24, "rows":16,
  "layers":[ {"name":"ground","data":[[ {"ts":"overworld","c":1,"r":12}, null ]]},
             {"name":"over","data":[[ ... ]]} ],
  "objects":[ {"name":"tree-oak","x":4,"y":9} ] }
```
tile cell: `{ts,c,r}` o `null`. object: `{name, x, y}` (sprite ancorato bottom sulla cella).

## Dove salvare le mappe
Gli export vanno in ~/Downloads. Spostali in `tools/assets-manager/atlas/maps/` (o dimmi il path) e Claude le legge.

> Estendibile: si possono aggiungere palette di "oggetti" (alberi nostri, chest, NPC) come stamp.
