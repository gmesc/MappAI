# MappAI BERT — Sottosistema Studio / Precision Teaching

> Stato al 22 giugno 2026. Branch: `feat/mastery-store` (8 commit sopra `main`).
> Implementa attività di studio sui 4 principi: **Precursor/Prerequisito, Precision
> Teaching, Mastery Learning, Active Recall**. Tutto vanilla JS, moduli `window.*`,
> caricati in `public/index.html` dopo `app.js`. Nessuna dipendenza nuova.

---

## Architettura: keystone + attività + viste

```
                 ┌─────────────────────────────┐
   ATTIVITÀ ───▶ │  mappai-mastery.js (STORE)  │ ◀─── VISTE leggono
   scrivono      │  padronanza per PINPOINT    │
                 │  (nodo × attività): EWMA acc │
                 │  + rate; localStorage/vault  │
                 └─────────────────────────────┘
   ATTIVITÀ che scrivono:                VISTE che leggono:
   • 7 modi studio attivo (hook in       • mastery-view  🎯 tinta nodi
     saveStudyScore → ingestSession)     • celeration    📈 crescita nel tempo
   • cloze 📝 (record + rate)            • study-path    🧭 cosa studiare ora
```

**Pinpoint** = `nodeId × attività` (es. `N1::richiamo`, `N1::cloze`). Per ognuno una
padronanza come **EWMA** dell'accuratezza (`ewma`, clamp 0..1) + **rate** (corrette/min,
`ewmaRaw`, NON clampato). `masteryLevel` a 2 fasi: `nuovo → in-corso → acquisito → fluente`
(fluente = accurato **E** rate ≥ `FLUENCY_AIM`=8).

---

## File (tutti in `public/js/`, + test in `tests/`)

| Modulo | Principio | Cosa fa | Test |
|---|---|---|---|
| `mappai-mastery.js` | 🔑 Fondamenta | Store padronanza per pinpoint (core puro UMD + layer browser localStorage). `record`, `node`, `level`, `ingestSession`. | `mastery.test.js`, `mastery-browser.test.js` |
| `mappai-active-study.js` *(esistente, +hook)* | 🔁 Active Recall | I 7 modi alimentano lo store: `saveStudyScore` → `MappAIMastery.ingestSession`. | — |
| `mappai-cloze.js` | 🔁 Active Recall | Modo Cloze graph-aware: oscura le etichette di ALTRI nodi nella desc (parole intere, no AI), tollerante refusi/accenti. Cronometrato → `rate`. | `cloze.test.js` |
| `mappai-mastery-view.js` | 🎯 Mastery | Toggle 🎯: tinge i nodi per livello (grigio/ambra/verde/blu) + legenda. Wrappa `renderGraph`, ripristina allo spegnimento. | (logica via mastery) |
| `mappai-celeration.js` | ⏱ Precision Teaching | 📈 grafico SVG: accuratezza + fluenza giorno-per-giorno (`buildSeries` aggrega la history). Lineare; SCC vero = futuro. | `celeration.test.js` |
| `mappai-study-path.js` | 🔗 Precursor + 🎯 rimedio | 🧭 "Cosa studiare ora": Pronti (prereq=genitore padroneggiato, gating SOFT), Da rivedere (deboli/stantii >7gg), Padroneggiati. | `study-path.test.js` |
| `mappai-palace.js` | 🔁 Active Recall | 🏛️ Palazzo della Memoria (Metodo dei Loci): rami L1 = stanze, concetti = oggetti; viaggio encode→recall per stanza. Riusa la geografia del vecchio bug L1. | `palace.test.js` |

**Test totali: 74/74 verdi** (`npm test` → `node --test`). Tutti i core puri testati in Node.

---

## UI (bottoni fluttuanti, lato destro)
`📝` Cloze (bottom:20) · `🎯` Padronanza-grafo (84) · `📈` Progressi (148) · `🧭` Cosa studiare ora (212) · `🏛️` Palazzo della Memoria (276).
+ "Studio attivo" nel menu esistente (7 modi).

---

## ⚠️ DA VERIFICARE A RUNTIME (Electron) — non ancora fatto
Gli 8 commit sono validati a livello logico/test, **non in app**. Dipendono da globali di
`app.js`: `renderGraph`, `cleanLabel`, `simulateNodeClick`/`zoomToNode`, `#map-svg`,
`circle.node-circle`, `d3`, `appState.db.nodes`.

**Checklist** (`npm start` → apri una mappa):
1. `🧭` → sezioni Pronti/Da rivedere/Padroneggiati; clic su un concetto → focus nodo.
2. `📝` Cloze → oscura concetti collegati, verifica, accetta refusi/accenti.
3. Fai qualche esercizio → `🎯` deve tingere i nodi (grigio→ambra→verde→blu).
4. `📈` → punti accuratezza (verde) e fluenza (blu); messaggio guida se 0/1 giorni.

Se un aggancio fallisce (nome globale diverso nel runtime), correggere nel modulo relativo.

---

## Dipendenze tra moduli / ordine di caricamento (index.html)
`app.js` → … → `mappai-mastery.js` → `mappai-active-study.js` → `mappai-mastery-view.js`
→ `mappai-cloze.js` → `mappai-celeration.js` → `mappai-study-path.js` → `mappai-palace.js` → `dev-console-metrics.js`.
(Le viste/attività usano `window.MappAIMastery`, quindi mastery va prima.)

---

## Prossimi passi possibili
1. **Test runtime** (sopra) — prioritario.
2. ✅ **Palazzo della Memoria** (loci) — FATTO (`mappai-palace.js`, commit `093f3a8`):
   viaggio per rami=stanze, encode→recall. Trasforma il vecchio bug L1-geografico in feature.
3. **Gating HARD** opzionale per Precursor (ora solo soft).
4. **Standard Celeration Chart vero** (scala ×2 semilog) come vista "pro" docente/OPI.
5. **Integrare i 4 bottoni** fluttuanti nella UI di studio esistente (ora sono uno stack).

---

## Fix collegato (stessa sessione)
`fix/l1-archiviazione-geografia` (commit `6119970`): la Fase 1 L1 collassava su una gerarchia
geografica prototipica (Robotica → monumenti di Siena!) per mode-collapse + prompt non ancorato
alla fonte. Fix in `L1_MACRO_CATEGORIES_IT/_EN`: REGOLA DI ANCORAGGIO ALLA FONTE (anti-geografia,
`rel` tematico). Diagnosi completa nei commit. Su `feat/mastery-store` è incluso.
