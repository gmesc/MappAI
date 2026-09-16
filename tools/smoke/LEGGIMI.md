# Banchi di prova — i moduli VERI, eseguiti

```bash
node tools/smoke/cornice-documenti.js        # testata e piè dei cinque documenti
node tools/smoke/elenchi-elabora-insegna.js  # gli elenchi di ELABORA e INSEGNA
node tools/smoke/studio-sidebar.js           # le leve della Vista studio
node tools/smoke/pipeline-lucchetto.js       # il lucchetto e la sentinella della pipeline
node tools/smoke/scelta-materiali.js         # le attività «a scelta» leggono i materiali
node tools/smoke/visione-fogli.js            # dalla scheda al DOSSIER e ai materiali
```

⚠️ **Il GLOSSARIO non è più fra i documenti provati** (15/9): `mappai-glossary.js` è
stato cancellato il 4/9 con la potatura del Memory Dungeon, e il caso che lo caricava
faceva morire il banco a metà — le prove dopo il glossario non venivano nemmeno
eseguite. Il caso è stato tolto: restano QUIZ, DOMANDE APERTE, SINTESI, TIMELINE e
CATENA DEI PERCHÉ, più gli helper della cornice del DOSSIER e il controllo privacy.
Il modulo NON va ricreato.

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
- **Il BUDGET di output.** `getMaxOutputTokens` vive in `app.js` e legge il modello
  attivo dal `#model-select` (o da `localStorage`): qui è stubbato a `n => n`, come
  nei test della suite. I banchi provano che il tetto ARRIVI al payload, non che sia
  il numero giusto per quel modello — i moltiplicatori si guardano in Electron.
- **Il RIEPILOGO di fine pipeline** (`_openSummary`): è il modale che chiude
  `Pipeline.run`. In `visione-fogli.js` il finto elemento ha `querySelector` e soci
  solo perché `run` arrivi in fondo senza lanciare; che cosa il docente legga in
  quel riquadro — righe, errori per passo, «Riprova» — lo dice solo l'app vera.
- Il VELO dentro l'area di CREA: `pipeline-lucchetto.js` prova il lucchetto e la
  sentinella, non il layout — dove si posa il velo lo dice il DOM vero.
- Il DISEGNO della Vista studio: `studio-sidebar.js` fa girare il pannello con un
  DOM finto e legge l'HTML che produce (quali leve, in che ordine, su che
  valore). Che la mappa esca leggibile con quei default si vede solo a schermo.
- **Il MOTORE di visione**, in `visione-fogli.js`. Il banco parte da una scheda
  già corretta e prova la catena da lì in giù: il DOSSIER (grafo dai blocchi →
  vault → documento «Analisi della fonte» → gli output), le OPZIONI per-tipo
  (categorie che filtrano i rami, angoli che moltiplicano i set) e il gesto di
  ELABORA (un foglio per angolo, con l'immagine incorporata).
  Restano fuori, apposta: **Gemini** — un banco che dipende da un servizio
  esterno fallisce per il motivo sbagliato, e direbbe «rotto» su un computer
  senza chiave — **`sips`** e la conversione dell'HEIC, la **superficie** di
  validazione, la **proiezione** (la sua geometria è in `tests/proiezione-core`)
  e il PDF vero.
  ⚠️ E il **testo** del blocco d'angolo delle flashcard è stubbato: vive in
  `mappai-study-session.js`, che vuole il DOM dell'app. Il banco prova il
  CABLAGGIO (che `_genFlashcards` lo chiami e lo metta in testa), non le parole.
  E soprattutto non prova la cosa che conta di più: **se il contesto che il
  modello propone sia giusto**. Quello lo può dire solo un docente che guarda la
  sua fonte, ed è il motivo per cui fra la lettura e la generazione c'è una
  scheda da correggere.

⚠️ **Un banco può passare per il motivo sbagliato.** È già successo: la prova
che i `.json` non finissero negli elenchi di INSEGNA girava sulla lista di
ELABORA, che li scarta già da sé — il filtro nuovo non veniva esercitato
affatto. Prima di fidarsi di un «ok», chiedersi da quale lista arriva il dato.
