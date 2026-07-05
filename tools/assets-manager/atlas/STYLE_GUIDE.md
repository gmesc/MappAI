# Style guide — Legend of Lua (base art del Memory Dungeon)

Studio su **124 sprite + 4 tileset**. Riferimenti: `lol_palette_sprites@2x.png`, `lol_palette_all@2x.png`, `lol_palette.gpl`.

## Palette

- **Colori unici**: sprite 395, tileset 244, totale ~440. NON è una palette fissa stretta (non DB16/32) — è hand-picked, **core ~50 colori**.
- **Carattere**: **caldo-terroso** dominante (bruni/tan/ocra: `#79584f #94785c #a87848 #885040 #563a3f`), **desaturato**. Saturazione alta solo sugli accenti.
- **Accenti** (riservati ai focal point): rosso eroe `#c0504a`, magenta/viola magia-boss, lime `#3abe41`/`#94e154`, blu acqua/UI `#1e7cb8`.
- **Grigi** per UI/pietra/metallo: near-black → `#949ea8` → `#d5d5d5` → `#ffffff`.
- **Ramp con hue-shift**: ombra → vira viola/freddo; luce → vira giallo/caldo. Mai shading "spento" (stessa tinta più scura).
- **Outline**: near-black **tintato** (`#201729` viola-nero, `#1a1a1a`, `#302c34`), selettivo sulla silhouette. Pure `#000000` usato ma non come regola universale.

## Stile / regole pixel

- **Proporzioni**: chibi/SD — testa grande, corpo piccolo. Eroe 19×21 ≈ 1.3 tile alto.
- **Griglia**: 16px. Tile 16×16; entità leggermente più alte di 1 tile, **piedi sul bordo basso** del tile (allineamento bottom).
- **Colori per sprite**: 4-8. Eroe = 6 (outline, tunica main+ombra, pelle, grigio, bianco).
- **Shading**: 2-3 valori per materiale (base + ombra [+ luce]). Niente gradienti.
- **Dithering**: praticamente assente → superfici piatte pulite.
- **Leggibilità**: silhouette forti, occhi/visi semplificati a pochi pixel.

## Per categoria

- **Personaggi** (player, npc): chibi, 19-23px alti, outfit a 2 toni, animazioni a pochi frame (walk 2-3, idle 4). Player sheet a griglia (down/up/idle).
- **Nemici**: bat 16×16 (2 frame), eye 40×20 (boss-like, grande), skeleton/mage 20×24. Ognuno con **ombra-blob** + spesso un frame "dead".
- **Item**: micro-sprite 6-16px (chiave, moneta, bomba, cuore, spada). Letti per silhouette + 1 accento colore.
- **Environment/tileset**: 16px, muri **top+front** (finto 3D), pavimenti + **decal** (sassi/erba), chest/door/tree come sprite separati bottom-allineati.
- **UI**: badge cuore/pozione con **outline bianco** spesso + numero; box item con cornice; font pixel (VT323, Kenney). Stile pulito, alto contrasto.
- **Effetti**: ombre (blob), `darkness.png` (300×300, vignette), slice/scorch/smoke, magic glow.

## ⚠️ Implicazione per i NOSTRI asset custom

La palette di lavoro impostata prima era **DB32** (più satura/fredda). Ma la base reale è LoL = **caldo-terroso muto**. Per coerenza, gli asset custom (door keeper, boss, item-memoria) vanno fatti con **`lol_palette.gpl`**, NON DB32 — altrimenti stonano (es. il door keeper attuale usa viola DB32 più acceso del viola-magia LoL). Allineare = ricolore leggero su palette LoL.

## Asset naturali LoL — studio tile (erba/piante/acqua/rocce)

Da `overworld.png` (zoom studiati). Tutti: **3 valori + outline `#1a1a1a`**, texture **clusterizzata e pulita** (mai speckle).

- **Cespugli** (overworld ~c0-6 r13-16): blob tondo 16px, 3 verdi, silhouette bumpy (round-brush), pochi grumi scuri interni come separazione-foglie, autotiling per siepi. → riferimento diretto per la chioma alberi.
- **Erba**: verde quasi piatto + micro-variazione minima. **Ciuffi** (c0-3 r11/r16): pochi fili più chiari, radi.
- **Fiori** (c4-6 r11-12): 1-2px bianco/giallo su erba.
- **Acqua** (c16 r0-3; c14-16 r6-10): blu piatto `#1e7cb8` + **archi-ripple** chiari curvi. **Riva**: foam chiaro al bordo erba/acqua.
- **Rocce/massi** (c8-13 r5-10): grigio-bruno 3-toni, **chiaro sopra / scuro sotto**, outline, **foam bianco alla base**. → riferimento per i decal-sassi.

Regola confermata: **superfici larghe + accenti in grumi (low-freq)**, non rumore pixel-per-pixel. Luce LoL ≈ dall'alto; per i nostri alberi usiamo **diffusa da destra 45°** (scelta utente). Generatore: `pipeline/trees.py` (noise low-freq → grumi).
