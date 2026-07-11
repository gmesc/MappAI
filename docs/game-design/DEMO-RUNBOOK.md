# DEMO RUNBOOK — Mappa "L'Albero e la Fotosintesi" + Mondo-Natura giocabile

> Preparato per la demo al pedagogista. Due asset pronti + una feature nuova
> (ponte-fluency con ricompensa). Tutto reversibile e flag-gated.

## Cosa è stato preparato

| Asset | File | Stato |
|---|---|---|
| Mappa mentale | `public/esempi/albero-fotosintesi-demo.json` | ✅ pronta (24 nodi, 5 rami, 14 cross-link) |
| Mondo giocabile | `docs/game-design/esempi/mondo-natura.json` | ✅ validato col core (`ok=true`) |
| Ponte-fluency + reward | codice in `mappai-games.js` / `-core.js` / `-voxel.js` | ✅ scritto, skin verificata in browser |

I **5 rami** della mappa = le **5 zone** del mondo (metodo dei loci):
Radici e Acqua · Foglie e Luce · Tronco e Linfa · La Fabbrica (Cloroplasto) · Prodotti.
Il giardino centrale è lo spawn. Ogni zona ha un **cancello-quiz** (guardiano). Dal Tronco
un **ponte** compare da solo quando raggiungi la padronanza → attraversi verso l'**Isola
della Maestria** → **ricompensa: nuovo aspetto dell'eroe + farfalla-guida**.

---

## PARTE A — La mappa mentale (rischio ZERO, sempre funziona)

1. Apri MappAI.
2. Landing → **"Apri JSON"** (oppure, a grafo aperto, menu azioni → **"Importa JSON"**).
3. Scegli `public/esempi/albero-fotosintesi-demo.json`.
4. Il grafo appare: 5 rami-natura, descrizioni dense (materiale di studio BES/DSA),
   cross-link con verbi (alimenta, attiva, produce, libera…).
5. Cose da mostrare: click su un nodo → **descrizione ricca**; **tutor AI**; **quiz/flashcard**;
   **timeline**; **suggerimenti strutturali**. Questa parte è il cuore del prodotto e non dipende da nulla.

> Se il mondo di gioco dovesse fare i capricci in live, **questa parte da sola è già una demo forte.**

---

## PARTE B — Il mondo giocabile (il "wow")

### Prerequisiti (verifica 1 volta)
- Skin dungeon = **voxel** (è il default). Se serve forzarla, in console:
  `localStorage.setItem('mappai_dungeon_skin','voxel')`
- Feature giochi attiva: `localStorage.setItem('mappai_games_enabled','1')` (se non già on).
- World mode ON (default): NON deve essere `localStorage.mappai_world_mode==='0'`.
- Ponte-fluency ON (default): NON deve essere `localStorage.mappai_world_bridge==='0'`.

### Passi
1. Con la mappa **aperta** (Parte A), **salvala nel vault** ("Salva nel vault" / salvataggio mappa).
   Questo crea la cartella del vault e imposta il vault attivo.
2. **Copia** il mondo nella cartella del vault. Nome cartella ≈ il titolo della mappa.
   Da terminale (aggiusta il nome se diverso):
   ```bash
   cp "docs/game-design/esempi/mondo-natura.json" \
      "$HOME/Documents/MappAI - Vault/L'Albero e la Fotosintesi/Memory Dungeon/mondo.json"
   ```
   (Se la cartella `Memory Dungeon/` non esiste, viene creata al salvataggio del vault;
   in caso, creala a mano.)
3. **Apri il Memory Dungeon** dall'app. Deve partire in **modalità mondo**:
   compare la **minimappa a zone** in alto a destra e il messaggio
   *"🌍 Mappa-mondo: le zone sono i rami della tua mappa…"*.
4. Muoviti con **WASD/frecce** (hold = passi continui), **SPAZIO** = salto sui dislivelli,
   **Q/E** ruota la camera, **rotellina** zoom. Click su una cella = cammina lì.

### Sceneggiatura consigliata (3 minuti)
1. Parti dal **giardino** verde con alberi. Mostra la minimappa: zone = rami della mappa.
2. Vai verso una zona (es. **Tronco e Linfa**, a est). Al confine c'è un **cancello**:
   raccogli le **memorie 📖** della zona (camminaci sopra → mini-sfida di studio) e supera
   il **quiz del guardiano** → il cancello si apre.
3. **Il momento clou**: consolidando il Tronco (padronanza ≥ 50%, cioè ~1 dei suoi 2 nodi
   davvero acquisito) **appare un ponte 🌉 sull'acqua** — *senza quiz, come ricompensa di
   competenza*. Attraversalo → **Isola della Maestria** → **nuovo sprite dell'eroe + 🦋**.

### Messaggio pedagogico (per il pedagogista)
- La ricompensa è **contingente alla fluency**, non al grinding (precision teaching).
- La competenza diventa **visibile e navigabile** nel mondo (autodeterminazione, SDT).
- Le zone sono i rami della mappa: **studiare = esplorare** (metodo dei loci).

---

## Se qualcosa non parte (fallback rapidi)
- Il dungeon parte "a piani" e non come mondo → manca `mondo.json` nel vault attivo,
  oppure la skin non è voxel, oppure THREE non è caricato. Controlla i prerequisiti.
- Il ponte non compare → serve **padronanza** del Tronco. Per una demo garantita puoi
  **abbassare la soglia**: nel `mondo.json`, slot `type:"bridge"`, metti `"req":{"mastery":0.01}`.
- Le zone non si legano ai rami giusti → i `branchHint` in `mondo.json` devono combaciare
  ESATTAMENTE con i label L1 della mappa (già allineati per questa mappa).

## Kill-switch (tutto reversibile)
```js
localStorage.setItem('mappai_world_bridge','0')  // disattiva i ponti-fluency
localStorage.setItem('mappai_world_mode','0')    // disattiva la modalità mondo
```
