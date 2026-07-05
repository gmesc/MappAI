# Come si costruiscono le stanze (studio + atlante)

Riferimento: screenshot Legend of Lua (stanza dungeon mattone + portale verde) vs motore Memory Dungeon (`public/js/mappai-games.js`, rot.js).

## Due paradigmi

| | Legend of Lua (screenshot) | Memory Dungeon (ora) |
|---|---|---|
| Layout | a mano in **Tiled** (`maps/*.tmx` → `.lua`) | procedurale **rot.js** `ROT.Map.Digger` |
| Tile muro | autotiling (top-cap + front + angoli) | **1 solo tile** `THEME_TILES.wall` |
| Pavimento | base + **decal sparsi** | 1 solo tile, niente decal |
| Uscita | oggetto `Transitions` (portale) su buca | gate room (door keeper) |

Struttura `testCave.lua`: layer `Base` (tilelayer = grafica) + objectgroup `Walls` (collisioni) + `Enemies`/`Loot`/`Triggers`/`Transitions` (marker). Grafica e fisica **separate**.

## I 3 strati che rendono "bella" la stanza

1. **Muro a 2 fasce** — top-cap (si cammina dietro) + faccia-front piu scura = finto 3D. + angoli + pilastri.
2. **Decal pavimento** — sassi/crepe sparsi sopra il tile base (~5-8% delle celle) → rompe la ripetizione.
3. **Uscita evidenziata** — il portale sta su una buca di terra scura (`exit_patch`) → cattura l'occhio.

Ordine di disegno: pavimento → decal → muri → oggetti/entita → HUD (overlay schermo).

## Autotiling — teoria completa (da ricerca online, 2026-07-03)

Fonti: [boristhebrave tileset roundup](https://www.boristhebrave.com/2013/07/14/tileset-roundup/) · [SLYNYRD PB20/43](https://www.slynyrd.com/blog/2023/3/26/pixelblog-43-top-down-tiles-part-2) · [zladx](https://zladx.github.io/posts/links-awakening-overworld-map) · [Screen Rambler](https://screenrambler.com/zeldadungeontiles/).

**Schemi** (tile richiesti / vicini letti):
- **Marching squares — 16 tile**, 4 angoli: `idx = TL + 2·TR + 4·BL + 8·BR`. Masse organiche.
- **Edge 4-bit — 16 valori**, 4 lati (U=1,R=2,D=4,L=8): siepi, muri, sentieri, rive. I pack 16px indie tipicamente forniscono un **blocco 3×3** (4 angoli + 4 lati + centro) + cap 1-wide = set 4-bit parziale; i valori mancanti → fallback centro.
- **Blob — 47 tile**, 8 vicini; l'angolo conta SOLO se entrambi i lati adiacenti sono pieni. Copertura totale, raro nei pack liberi.
- Sub-blob (20 sub-tile, RPG Maker VX) / micro-blob (13): assemblaggio a quarti di tile (eredità dei metatile 8×8 del Game Boy).

**Regola-Zelda per i muri** (LoL, 0x72, LA — verificata sui nostri tileset): *cella-muro con PAVIMENTO a sud → tile FRONT; altrimenti → tile TOP/cap*. Bastano **2 tile** per il muro a 2 fasce su qualunque forma. Angoli estetici opzionali.

**Ruoli verificati nel tileset LoL overworld** (vedi `tileset_atlas.json → terrains`): siepe = blocco 3×3 `c1-3 r13-15` + cap `c0` · muro dungeon = top `[33,17]` front `[33,18]` · rive pond = `c15-17 r6-8` (foam) con acqua piena `[16,7]`.

## Slicing corretto di un tileset PNG

1. **Grid-first**: tile size / margin / spacing PRIMA di tutto; indicizza `[col,row]` (`sx=c*T, sy=r*T`), mai offset pixel a mano.
2. Oggetti oversized (alberi 63×62, case) = **sprite ancorati bottom-center** o blocchi multi-tile sulla stessa griglia — non tile.
3. **Contact-sheet col righello** e verifica visiva dei ruoli prima dell'uso (pattern `tileset_atlas.py`). Mai fidarsi di coordinate indovinate.
4. Anti-**bleeding**: sample esattamente T×T, draw a coordinate intere, `imageSmoothingEnabled=false`.
5. I tile 16×16 retro sono spesso 4 micro-tile 8×8 (metatile) → spiega i "quarti" ripetuti nello sheet.

## Composizione livelli (struttura Zelda LA — case study visivo)

- **Lo schermo è il modulo** (LA: 10×8 tile da 16px): si progetta e si giudica uno schermo alla volta.
- **Tileset per zona** (LA: sezioni 2×2 stanze) → bioma = cluster di schermi contigui.
- **Zone-cuscinetto**: ~⅓ della overworld di Koholint è schermi "keep current" che usano SOLO tile condivisi dai tileset adiacenti → le transizioni fra biomi passano per corridoi semplici, mai giunture secche. (Nel Memory Dungeon: radure e gate room giocano già questo ruolo.)
- Per-schermo: bordi quasi chiusi con 1-2 aperture; path che guida l'occhio; centro camminabile, decorazione ai bordi; riuso estremo dei tile (gli stessi tile in 4+ dungeon — Screen Rambler).
- **Ombre drop costanti** ovunque (≤1 tile, 1-2 facce) a prescindere dall'altezza del muro (SLYNYRD).
- Skill completa: `pixel-art-tilemaps` (con patterns e cheatsheet bitmask).

## Upgrade del motore rot.js (Path A, resta procedurale)

Nel renderer (`_drawDun`/tile loop di `mappai-games.js`):
1. sostituisci il singolo `wall` con una funzione `wallTile(mask)` che usa `tileset_atlas.json`.
2. dopo il pavimento, stampa un decal random da `floor_decals` con prob. bassa (seed deterministico per cella → stabile tra frame).
3. al gate room, disegna `exit_patch` sotto il door keeper.

Path B (stanze a mano in Tiled) = piu controllo ma serve un parser `.tmx`/`.lua` in JS → piu pesante. Procedurale consigliato per un gioco di studio (varieta infinita).

## Polish uso-asset (da reference screenshot del gioco vero)

Cosa fa Legend of Lua che alza la resa, in ordine d'impatto:

1. **Ombra sotto ogni sprite** — ellisse scura semitrasparente ai piedi (eroe, nemici, custode, boss, item). Costo zero, toglie il "fluttuare". Asset: `effects/shadows`, `blobs`, `lootShadow.png`.
2. **Buio + sorgenti luce** — vignette scura (`darkness.png` 300×300, oggi inutilizzato) con cerchio di luce attorno all'eroe; **torce** alle pareti che "bucano" il buio (radial light, composite `lighter`, flicker). Mappe con `dark=true`. Mood enorme nelle cave/dungeon profondi.
3. **Decal** pavimento (già in atlas) — ciuffi d'erba (overworld) / sassi (dungeon).
4. **Muri top+front 3D** (già in atlas).
5. **Healthbar BOSS** + label in basso durante il duello col Guardiano.
6. **Bolle dialogo** sopra NPC/custode (indicatore interazione, `enemies/alert.png`).
7. **Palette per biome/piano** — verde root → dungeon mattone → cava rossa/scura. Lega a "piano = categoria nodi".
8. **Set dressing** — alberi (`tree.png`) + stendardi per giardino/villaggio; torce + chest per dungeon.

Ordine di disegno aggiornato: pavimento → decal → **ombre** → sprite/oggetti → **overlay buio + luci** → HUD (HP/MP, bossbar).

## File

- `tileset_atlas.json` — coord [col,row] dei tile chiave per biome.
- `*_grid.png` — tileset con righello coordinate (per leggere qualsiasi tile).
- `ow_zoom_walls.png`, `ow_zoom_floor.png` — zoom regioni dungeon overworld.
- Genera/aggiorna con `pipeline/tileset_atlas.py`.
