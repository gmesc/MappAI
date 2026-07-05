# Crediti asset — Legend of Lua

Asset importati da **Legend of Lua**, gioco open-source Love2D di **Challacade LLC**.

- Repo: https://github.com/challacade/legend-of-lua
- Pagina gioco: https://www.challacade.com/games/legend-of-lua
- Versione: open-source pre-ottobre 2022 (le versioni successive usano asset proprietari NON inclusi qui)

Usati in MappAI per il reskin grafico del modulo **Memory Dungeon** (`public/js/mappai-games.js`).

## Licenze

### Codice, grafica, audio, mappe → MIT (Challacade LLC)
Copyright (c) 2020 Challacade LLC — testo completo in `LICENSE-legend-of-lua.txt`.
Copre: `sprites/` (incl. sorgenti `_edit/*.aseprite`, `*.xcf` e `_shelf/`), `maps/`
(tileset `.png` + varianti, layout `.tmx` e `.lua` esportati da Tiled/STI), `sounds/*.wav`.
La MIT consente uso, modifica e ridistribuzione mantenendo il copyright notice.

### Font → licenza propria di terzi (NON MIT)
I font erano bundlati nel repo ma restano sotto la loro licenza originale:
- `fonts/kenney-pixel-square/`, `fonts/kenney_fontpackage/` — **Kenney.nl, CC0** (vedi `kenney_fontpackage/License.txt`)
- `fonts/vt323/` — **SIL Open Font License 1.1** (Peter Hull)

## Contenuto importato (completo)
- `sprites/` — player (5 outfit), nemici (bat, eye, skeleton knife/mage), ambiente
  (forzieri normali/grandi, porte, alberi, muri/rocce distruttibili, wave), item
  (monete/cuori animati, bomba, boomerang, arco/frecce, rampino, lanterna, spada),
  effetti (darkness/fog, explosion, fireball, slice, blobs, scorch), UI (cuori, box,
  menu pausa), NPC (merchant), `_shelf/` (character multi-NPC, objects, tileset extra, font bitmap)
- `sprites/_edit/`, `*.xcf` — **sorgenti editabili** (Aseprite/GIMP) per modifica
- `maps/` — tileset (overworld/inner/cave + varianti) e mappe `.tmx`/`.lua` di esempio
- `sounds/` — 19 effetti (spada, monete, forzieri, nemici, UI)
- `fonts/` — Kenney (CC0) + VT323 (OFL)

## Note
- I file sorgente (`.aseprite`, `.xcf`, `.tmx`, `.lua`) sono inclusi per l'editing;
  a runtime il gioco carica solo `.png`/`.wav`/`.ttf`. Se si vuole ridurre la dimensione
  del build di distribuzione, escludere `sprites/_edit/`, `*.xcf`, `maps/_old*`, `maps/*.tmx`.
