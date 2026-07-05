# assets-manager — toolchain pixel art (Memory Dungeon)

Tooling per generare/ricolorare/documentare gli asset grafici del modulo **Memory Dungeon** (reskin Legend of Lua). Lavoro su questo branch `assets-manager`.

## Stack
- **Aseprite** (compilato da sorgente, `/Applications/Aseprite.app`) + **pixel-plugin** MCP (`aseprite`, 50 tool) — editing/animazione a linguaggio naturale.
- **Pillow / sharp** — generazione/recolor/atlas a codice (pipeline qui sotto).
- Palette di lavoro: `atlas/lol_palette.gpl` (estratta dagli asset LoL — caldo-terroso, vedi `atlas/STYLE_GUIDE.md`). **NON** DB32 (`palettes/db32.gpl` deprecata).

## pipeline/ (Python, path assoluti a questa macchina)
- `recolor.py` — recolor parametrico via color-map (es. outfit eroe → `public/assets/legendoflua/sprites/player/playerSheet*.png`).
- `doorkeeper.py` — door keeper 64×16 4-frame → `public/assets/gatekeeper.png`.
- `boss.py` — boss "Guardiano della Memoria" 32×32 4-frame → `public/assets/legendoflua/sprites/enemies/boss_guardian.png`.
- `tileset_atlas.py` — render tileset con righello [col,row] → `atlas/*_grid.png`.
- `palette_study.py` — istogramma colori globale + swatch + `.gpl`.

Input: leggono `public/assets/...`. Output: sprite di gioco in `public/assets/...`; preview/atlas in `tools/assets-manager/{atlas,palettes}/`.

## atlas/ (studio + riferimento)
- `STYLE_GUIDE.md` — palette, regole pixel, per-categoria.
- `ROOM_BUILDING.md` — come si costruiscono le stanze (Tiled vs rot.js, autotiling, polish uso-asset).
- `tileset_atlas.json` — coord tile chiave per biome.
- `*_grid.png`, `ow_zoom_*.png`, `verify_tiles.png` — riferimenti tileset.
- `lol_palette*.png` + `lol_palette.gpl` — palette estratta.

## Integrazione nel gioco
Renderer: `public/js/mappai-games.js`. Polish layer gated da `localStorage 'mappai_dungeon_polish'` (toggle `MappAIGames.polish(bool)`): ombre, buio+luci, bossbar, bolle. Decal/autotile **staged** (abilitare via `MappAIGames.tuneLoL({biome,decals,decalPct})` dopo verifica coord per-biome).
