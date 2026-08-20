# Banchi di prova — i moduli VERI, eseguiti

```bash
node tools/smoke/cornice-documenti.js        # testata e piè dei sei documenti
node tools/smoke/elenchi-elabora-insegna.js  # gli elenchi di ELABORA e INSEGNA
node tools/smoke/studio-sidebar.js           # le leve della Vista studio
node tools/smoke/pipeline-lucchetto.js       # il lucchetto e la sentinella della pipeline
node tools/smoke/scelta-materiali.js         # le attività «a scelta» leggono i materiali
node tools/smoke/visione-fogli.js            # da un'immagine ai fogli, per angolo
```

⚠️ **`censimento-maniglia-cdp.js` non è di questa famiglia**: vuole l'APP VERA
(`npx electron . --remote-debugging-port=9222` e poi lo script) perché misura il
LAYOUT — dove la maniglia della colonna sconfina nell'area delle console e su
che cosa finisce sopra. Si rifà dopo ogni intervento su quel confine; il piano
sta in `docs/HANDOFF-maniglia-layout.md`.

⚠️ **`cdp.js` non è nemmeno un banco: è il PONTE verso l'app viva** (15/8).
`node tools/smoke/cdp.js "<espressione>" [attesaMs]` valuta un'espressione nel
renderer dell'app aperta con `--remote-debugging-port=9222` e stampa valore,
eccezioni ed errori di console. Da solo non prova NIENTE: è uno strumento di
misura, per ciò che il pannello browser non può toccare (IPC, disco, vault,
`localStorage` vero, finestre, uscita dall'app).
Due trappole pagate lo stesso giorno: se la porta 9222 è tenuta da un'istanza
VECCHIA si parla con quella — e se il suo renderer è morto `Runtime.evaluate`
non risponde mai, il che sembra un blocco dell'app (`lsof -ti :9222` prima di
accusare il codice); e `appState`/`StorageManager` sono const lessicali, da qui
si vedono solo i `window.*` (invariante 3). Per GUARDARE, non solo misurare, c'è
`Page.captureScreenshot`: due difetti della vista Impostazioni AI (il titolo
sotto la maniglia, le due righe della lingua con vesti diverse) si vedevano solo
nell'immagine.

Non sono test della suite (`node --test tests/`), e non lo diventano: caricano i
moduli dell'app con `vm` dando loro un finto `window`, un finto `appState` e
finti IPC. Servono a provare quello che i test puri non raggiungono — che cosa
esce davvero dai builder dei documenti e che cosa finisce davvero nelle righe
delle due console — senza aprire Electron.

⚠️ **Trappola nota (§7.8 del progetto): eseguire, non parsare.** Un modulo si
prova facendolo girare; leggerne il sorgente con una regex dice che il codice
c'è, non che funziona.

⚠️ **Il sandbox È `window`.** Nel browser `window.X = …` crea anche il globale
`X`, e i moduli ci contano (`mappai-timeline.js` scrive `window.MappAITimeline`
e alla riga dopo usa `MappAITimeline`). Con un `window` messo *dentro* il
sandbox invece che *come* sandbox, quei file esplodono al caricamento.

⚠️ **Quello che questi banchi NON possono provare**, e va guardato in Electron:
- `_diskCache` (mappai-landing-teach.js) è privata e la popola il caricamento di
  INSEGNA → i comandi del FILE (stampa · scarica · cartella) non si esercitano
  da qui: si verifica la struttura della tabella, non i bottoni a schermo.
- `_disco` (mappai-elabora-console.js) è privato: NON si inietta dall'esterno,
  si stubba l'IPC `vaultMaterialsList` da cui il modulo lo legge, e si aspetta
  un giro di event loop.
- La stampa vera, i PDF scritti su disco, i dialoghi di sistema.
- Il VELO dentro l'area di CREA: `pipeline-lucchetto.js` prova il lucchetto e la
  sentinella, non il layout — dove si posa il velo lo dice il DOM vero.
- Il DISEGNO della Vista studio: `studio-sidebar.js` fa girare il pannello con un
  DOM finto e legge l'HTML che produce (quali leve, in che ordine, su che
  valore). Che la mappa esca leggibile con quei default si vede solo a schermo.
- **Il MOTORE di visione**, in `visione-fogli.js`. Il banco parte da una scheda
  già corretta e prova la catena da lì in giù (materiale → foglio per angolo →
  archivio → nome del file → giro dell'editor). Restano fuori, apposta:
  **Ollama** — un banco che dipende da un server esterno fallisce per il motivo
  sbagliato, e direbbe «rotto» su un computer dove il modello non è installato —
  **`sips`** e la conversione di HEIC e TIFF, la **superficie** dei passi di
  «Crea un documento», e il PDF vero. E soprattutto non prova la cosa che conta
  di più: **se il contesto che il modello propone sia giusto**. Quello lo può
  dire solo un docente che guarda la sua fonte, ed è il motivo per cui fra la
  lettura e la generazione c'è una scheda da correggere.

⚠️ **Un banco può passare per il motivo sbagliato.** È già successo: la prova
che i `.json` non finissero negli elenchi di INSEGNA girava sulla lista di
ELABORA, che li scarta già da sé — il filtro nuovo non veniva esercitato
affatto. Prima di fidarsi di un «ok», chiedersi da quale lista arriva il dato.
