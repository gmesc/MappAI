# Banchi di prova — i moduli VERI, eseguiti

```bash
node tools/smoke/cornice-documenti.js        # testata e piè dei sei documenti
node tools/smoke/elenchi-elabora-insegna.js  # gli elenchi di ELABORA e INSEGNA
node tools/smoke/studio-sidebar.js           # le leve della Vista studio
node tools/smoke/pipeline-lucchetto.js       # il lucchetto e la sentinella della pipeline
```

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

⚠️ **Un banco può passare per il motivo sbagliato.** È già successo: la prova
che i `.json` non finissero negli elenchi di INSEGNA girava sulla lista di
ELABORA, che li scarta già da sé — il filtro nuovo non veniva esercitato
affatto. Prima di fidarsi di un «ok», chiedersi da quale lista arriva il dato.
