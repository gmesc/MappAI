# HANDOFF — creare un materiale di studio a mano (CHIUSO il 13/8/26 sera)

> ✅ **CHIUSO.** I difetti sotto sono corretti e **provati in Electron vivo** (CDP,
> vault reale «La Politica Svizzera», generazione con AI vera): 3.1 (archivio PRIMA
> del PDF), 3.2 (titolo in convenzione cloni), 3.3 (`segnala` nel ramo documento),
> 3.4 (INSEGNA nasconde le voci d'archivio cartacee; in ELABORA cestino e clona,
> decisione di Giacomo). Lo stato vive in **[`HANDOFF.md`](HANDOFF.md)** §4; questo
> file resta come diario e — per la sua stessa regola — è un candidato
> all'eliminazione (decide Giacomo).
> Nota di chiusura: nell'app viva `htmlToPdf` risponde (il «sospetto B» non si è
> riprodotto); qualunque fosse la causa di quel giorno, ora un guasto della resa
> non butta più via la sorgente.

---

## 0. Che cosa è successo, con le parole di Giacomo

1. Ha generato un quiz a **domande aperte** chiamato `PROVAPROVAPROVA`: **non compare
   da nessuna parte** — né in ELABORA, né in INSEGNA, né come file nella cartella.
2. La tabella di INSEGNA mostra **file che lui aveva eliminato a mano** dalla cartella
   `2A ▸ Geografia ▸ La Politica Svizzera ▸ Materiale Studio`.

Sono **due difetti indipendenti**. Il secondo è compreso e ha una causa certa; il primo
ha tre cause possibili e per distinguerle serve una prova in Electron.

---

## 1. Il materiale che non compare — che cosa è VERIFICATO

Dalla schermata: nel gruppo QUIZ ci sono **cinque righe** — tre voci d'archivio (colonna
`HTML`) e due file su disco (`PDF`). `PROVAPROVAPROVA` **non c'è in nessuna delle due
famiglie**. Questo esclude un problema di sola visualizzazione: se la generazione fosse
arrivata in fondo, ci sarebbe **almeno** la voce d'archivio, che non dipende dal disco.

Quindi `MappAIPipeline.generaSet` è uscita **prima** di `MappAIStudyDocs.save`. Nel ramo
delle domande aperte (`spec.documento`) i punti d'uscita, in ordine, sono tre:

| # | dove | che cosa si vede a schermo |
|---|---|---|
| A | l'AI non produce domande usabili → `cq_vuoto` | toast: «L'AI non ha prodotto domande utilizzabili…» |
| B | `window.electronAPI.htmlToPdf` fallisce → `{ok:false, errore:'PDF non generato'}` | toast: «PDF non generato» |
| C | eccezione in `buildOpenQuestionsHtml` / `_genOpenQuestions` → `catch` esterno | toast con il messaggio dell'eccezione |

**Come distinguerle in due minuti** (Electron, console aperta):

```
1. ELABORA → Crea un documento → Quiz o flashcard → Domande aperte → Le genera l'AI
2. nome: PROVA2 · 3 domande · Tutta la mappa · Automatico
3. guardare: (a) il TOAST che compare  (b) la console  (c) se in
   «Materiale Studio/» compare «Domande-aperte-<Mappa>-PROVA2.pdf»
```

Il toast dice quale dei tre rami ha risposto. ⚠️ Se **non compare nessun toast**, il
problema è a monte: il modale non ha chiamato `generaSet` — si verifica con
`window.MappAIPipeline.generaSet` in console e un `console.log` all'ingresso.

### Il sospetto principale: `htmlToPdf` su un foglio senza tracce

`generaSet` per le domande aperte fa **un solo PDF** e lo fa dalla copia **col foglio
delle tracce di correzione**. La pipeline fa la stessa cosa e funziona, ma con una
differenza: la pipeline gira **dopo** aver appena scritto il vault, `generaSet` no. Se
`htmlToPdf` fallisce (finestra offscreen non disponibile, o `landscape` non passato dove
serve), il ramo B esce **prima** dell'archivio — e in quel caso il difetto vero è che
**l'ordine è sbagliato**: la voce d'archivio è la SORGENTE (porta l'HTML con dentro le
domande), il PDF è una conseguenza. Vedi §3.1.

---

## 2. I file cancellati che restano a video — causa CERTA

L'archivio (`MappAIStudyDocs`, in `localStorage`) e il disco sono **due mondi che non si
parlano**, ed è dichiarato nel codice:

> `mappai-landing-teach.js`, `deleteDoc`: «L'archivio vive in localStorage e non sa quali
> file siano stati scritti nel vault: qui si toglie la voce, non il file.»

INSEGNA **unisce** le due fonti. Quindi cancellando un PDF dal Finder:

- la riga `PDF` sparisce (viene dal disco) ✔
- la riga `HTML` **resta** (viene da localStorage) ✘ — ed è quella che Giacomo vede

⚠️ Non è codice morto: la voce d'archivio è ciò che permette di **ristampare** un quiz
senza riaprire la mappa (da un PDF non si ricava più niente). Il difetto non è che
esista, è che **non dica** che il suo file non c'è più.

---

## 3. Che cosa fare, in ordine

### 3.1 Invertire l'ordine nel ramo «documento» di `generaSet`
`public/js/mappai-material-pipeline.js`, `Pipeline.generaSet`, ramo `if (spec.documento)`.

Oggi: `html` → **PDF** → *(se fallisce esce)* → vault → archivio.
Deve essere: `html` → **archivio** → PDF → vault, e il PDF che fallisce **avvisa senza
buttare via il lavoro**. La ragione è la regola già scritta nella pipeline: l'HTML è la
sorgente, il PDF è una resa. Un errore nella resa non deve far sparire la sorgente —
oggi tre minuti di generazione AI si perdono per una finestra offscreen che non risponde.

### 3.2 Il nome della copia deve entrare nel TITOLO con la convenzione dei cloni
⚠️ **Difetto trovato leggendo, non ancora visto a schermo**, e morde solo dopo il 3.1.

Per i quiz giocabili il nome sta in `set.clone`, e ELABORA lo legge da lì. Per le
**domande aperte** non c'è nessun set: la copia vive nell'archivio, e ELABORA ricava il
nome **dal titolo** con `_cloneDalTitolo`, che si aspetta la convenzione di
`MappAIClona.etichetta(genere, nome)`:

```
atteso da ELABORA:   «Domande Aperte - PROVAPROVAPROVA»
scritto da generaSet: «La Politica Svizzera — Domande aperte · PROVAPROVAPROVA»
```

Con il titolo attuale il documento **si vede** ma non è riconosciuto come copia: il nome
non compare nella riga, e due copie della stessa mappa si contendono la stessa voce
(`_docArchivioAperte` tiene **solo la più recente**, `cand[0]`). Quindi: comporre il
titolo con `MappAIClona.etichetta('Domande aperte', nome)` per i generi d'archivio.

### 3.3 Annunciare la scrittura anche nel ramo «documento»
Nel ramo dei set c'è `MappAIVaults.segnala('materiali-generati', …)`; nel ramo documento
**manca**. Senza, gli elenchi già aperti non si aggiornano e il materiale «compare al
giro dopo» — è lo stesso difetto corretto ieri per la creazione a mano (`e6e57c3`).

### 3.4 Dire che un file d'archivio non c'è più
Tre strade, in ordine di costo:

1. **Marcare** la riga d'archivio senza file (badge «solo archivio»): onesto, non
   distrugge niente, e il docente capisce perché non ha il cestino del file;
2. **Riconciliare** all'apertura di INSEGNA: le voci il cui file atteso non esiste più si
   tolgono. ⚠️ Butta via la sorgente di ristampa, e il file può mancare per motivi
   legittimi (vault su un altro computer, cartella non ancora sincronizzata);
3. **Cestino anche sulle righe d'archivio**, che oggi non ce l'hanno.

La 1 + la 3 insieme sembrano la coppia giusta: si vede lo stato e si può agire. Ma è una
decisione di Giacomo, non una conseguenza tecnica.

---

## 4. Come si prova che è finita

```bash
node --test tests/                         # 0 fail
node tools/smoke/pipeline-lucchetto.js     # TUTTO OK
```

E in **Electron**, che è l'unico posto dove `htmlToPdf` e il disco esistono davvero:

1. generare domande aperte con un nome → compare **subito** in ELABORA (come sorgente
   modificabile) e in INSEGNA (voce d'archivio + PDF), col **nome nella riga**;
2. generarne un **secondo** con un nome diverso → si vedono **tutte e due**;
3. staccare la rete (o rompere `htmlToPdf` a mano) → il documento **resta**, e il toast
   dice che il PDF non è stato scritto;
4. cancellare il PDF dal Finder → la riga d'archivio dice che il file non c'è più.

⚠️ Il banco in Node **non** può provare niente di tutto questo: `htmlToPdf`,
`saveVaultFile` e la cartella sono IPC. Si può però estendere
`tools/smoke/pipeline-lucchetto.js` con l'ordine delle chiamate (archivio prima del PDF)
usando IPC finti — quello sì, ed è la prova che il 3.1 non torni indietro.

---

## 5. Dove guardare

| | |
|---|---|
| il ramo che esce presto | `Pipeline.generaSet`, `if (spec.documento)` in `mappai-material-pipeline.js` |
| il percorso a tre passi | `public/js/mappai-crea-quiz.js` |
| chi legge il nome della copia | `_cloneDalTitolo` · `_archivioAperte` · `_docArchivioAperte` in `mappai-elabora-console.js` |
| la convenzione dei nomi | `MappAIClona.etichetta` in `mappai-clona-core.js` · `buildFileName` in `mappai-pipeline-core.js` |
| l'unione archivio↔disco | `renderMaterials` e `deleteDoc` in `mappai-landing-teach.js` |
